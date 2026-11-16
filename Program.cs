// 학습지 서버: 화면(wwwroot) + 코드 실행 API(/run/sql, /run/cs|js|ts|rust).
using System.Diagnostics;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

const string Url = "http://localhost:5080";
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(Url);
var app = builder.Build();

// 받은 코드를 그대로 실행하는 서버라서, 이 PC의 이 페이지에서 보낸 요청만 받는다.
app.Use(async (ctx, next) =>
{
    var origin = ctx.Request.Headers.Origin.ToString();
    if (ctx.Request.Host.Host != "localhost" || (origin != "" && origin != Url))
    {
        ctx.Response.StatusCode = 403;
        return;
    }
    await next();
});
app.UseDefaultFiles();
app.UseStaticFiles();

var connStr = new SqlConnectionStringBuilder
{
    DataSource = "localhost,1433",
    UserID = "sa",
    Password = Environment.GetEnvironmentVariable("QUIZ_SQL_PASSWORD"),
    TrustServerCertificate = true,
    Pooling = false,
}.ConnectionString;

// ponytail: 한 번에 하나만 실행한다(연습용 DB와 임시 파일을 같이 쓴다). 여러 명이 쓰게 되면 실행마다 DB를 따로 만든다.
var gate = new SemaphoreSlim(1, 1);

app.MapPost("/run/sql", (RunRequest req) => Locked(() => RunSql(req)));
app.MapPost("/run/{lang}", (string lang, RunRequest req) => Locked(() => RunCode(lang, req.Code)));
app.Run();

async Task<object> Locked(Func<Task<object>> run)
{
    await gate.WaitAsync();
    try { return await run(); }
    finally { gate.Release(); }
}

// 연습용 DB(QuizScratch)를 새로 만들고 → 준비 SQL → 사용자 SQL 순서로 실행한다.
async Task<object> RunSql(RunRequest req)
{
    var output = new List<object>();   // 실행 결과: 표, 메시지, 에러가 나온 순서대로
    var tables = new List<object>();   // 실행이 끝난 뒤 각 테이블의 내용
    try
    {
        await using var conn = new SqlConnection(connStr);
        await conn.OpenAsync();
        await Exec(conn, "IF DB_ID('QuizScratch') IS NOT NULL BEGIN ALTER DATABASE QuizScratch SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE QuizScratch; END;");
        await Exec(conn, "CREATE DATABASE QuizScratch COLLATE Korean_Wansung_CI_AS;");
        conn.ChangeDatabase("QuizScratch");
        if (!string.IsNullOrWhiteSpace(req.Setup)) await Exec(conn, req.Setup);

        if (!string.IsNullOrWhiteSpace(req.Code))
        {
            // 제약 위반 같은 에러가 나도 멈추지 않고 SSMS처럼 "Msg 547: ..." 을 순서대로 모은다.
            SqlInfoMessageEventHandler onMessage = (_, e) =>
            {
                foreach (SqlError err in e.Errors)
                    output.Add(err.Class > 10
                        ? new { type = "error", text = $"Msg {err.Number}: {err.Message}" }
                        : new { type = "msg", text = err.Message });
            };
            conn.InfoMessage += onMessage;
            conn.FireInfoMessageEventOnUserErrors = true;
            await using (var cmd = new SqlCommand(req.Code, conn) { CommandTimeout = 10 })
            {
                cmd.StatementCompleted += (_, e) => output.Add(new { type = "msg", text = $"({e.RecordCount}줄 처리됨)" });
                await using var reader = await cmd.ExecuteReaderAsync();
                do
                {
                    if (reader.FieldCount > 0) await ReadTable(reader, null, output);
                } while (await reader.NextResultAsync());
            }
            conn.FireInfoMessageEventOnUserErrors = false;
            conn.InfoMessage -= onMessage;
        }

        var names = new List<(string Name, string Quoted)>();
        await using (var cmd = new SqlCommand("SELECT name, QUOTENAME(name) FROM sys.tables ORDER BY create_date, name", conn))
        await using (var reader = await cmd.ExecuteReaderAsync())
            while (await reader.ReadAsync()) names.Add((reader.GetString(0), reader.GetString(1)));
        foreach (var (name, quoted) in names)
        {
            await using var cmd = new SqlCommand($"SELECT * FROM {quoted}", conn);
            await using var reader = await cmd.ExecuteReaderAsync();
            await ReadTable(reader, name, tables);
        }
    }
    catch (SqlException ex)
    {
        output.Add(new { type = "error", text = $"Msg {ex.Number}: {ex.Message}" });
    }
    return new { output, tables };
}

async Task Exec(SqlConnection conn, string sql)
{
    await using var cmd = new SqlCommand(sql, conn);
    await cmd.ExecuteNonQueryAsync();
}

// 표를 목록에 먼저 넣고 줄을 채운다. 그래야 "(n줄 처리됨)" 메시지가 표 뒤에 온다.
async Task ReadTable(SqlDataReader reader, string? name, List<object> into)
{
    var columns = Enumerable.Range(0, reader.FieldCount)
        .Select(i => reader.GetName(i) is { Length: > 0 } n ? n : "(이름 없음)").ToArray();
    var rows = new List<string?[]>();
    into.Add(new { type = "table", name, columns, rows });
    while (rows.Count < 200 && await reader.ReadAsync())
        rows.Add(columns.Select((_, i) => reader.IsDBNull(i) ? null : Format(reader.GetValue(i))).ToArray());
}

string Format(object value) => value switch
{
    DateTime d => d.ToString(d.TimeOfDay == TimeSpan.Zero ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm:ss"),
    bool b => b ? "1" : "0",
    IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
    _ => value.ToString() ?? "",
};

// 코드를 임시 폴더의 파일 하나로 저장하고, 언어별 명령을 차례로 실행한다(컴파일 → 실행).
async Task<object> RunCode(string lang, string code)
{
    var dir = Path.Combine(Path.GetTempPath(), "quiz-run");
    Directory.CreateDirectory(dir);
    var tsc = Path.Combine(app.Environment.ContentRootPath, "node_modules/typescript/bin/tsc");
    (string File, string[][] Steps)? plan = lang switch
    {
        "cs" => ("Snippet.cs", [["dotnet", "run", "Snippet.cs"]]),   // .NET 10의 파일 하나 실행 기능
        "js" => ("Snippet.mjs", [["node", "Snippet.mjs"]]),
        "ts" => ("Snippet.mts", [["node", tsc, "--strict", "--target", "es2022", "--module", "nodenext", "--noEmitOnError", "Snippet.mts"], ["node", "Snippet.mjs"]]),
        "rust" => ("Snippet.rs", [["rustc", "--edition", "2021", "-o", "snippet", "Snippet.rs"], [Path.Combine(dir, "snippet")]]),
        _ => null,
    };
    if (plan is not var (file, steps)) return new { ok = false, text = "지원하지 않는 언어예요." };

    await File.WriteAllTextAsync(Path.Combine(dir, file), code);

    var text = "";
    foreach (var step in steps)
    {
        var psi = new ProcessStartInfo(step[0], step[1..])
        {
            WorkingDirectory = dir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.Environment["DOTNET_NOLOGO"] = "1";
        psi.Environment["DOTNET_CLI_UI_LANGUAGE"] = "en";
        using var process = Process.Start(psi)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            return new { ok = false, text = "60초가 넘어 중단했어요. 끝나지 않는 반복문이 있는지 확인해 보세요." };
        }
        text += await stdout + await stderr;
        if (process.ExitCode != 0) return new { ok = false, text = Clean(text) };
    }
    return new { ok = true, text = Clean(text) };

    // 긴 임시 폴더 경로는 가린다
    string Clean(string s) => Regex.Replace(s, @"[^\s(]*/quiz-run/", "").Trim();
}

record RunRequest(string? Setup, string Code);
