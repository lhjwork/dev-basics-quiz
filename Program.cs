// 학습지 서버: 화면(wwwroot) + 코드 실행 API(/run/sql, /run/cs|js|ts|rust).
using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

// 설정(환경 변수). 아무것도 주지 않으면 내 컴퓨터에서만 쓰는 상태다.
//   QUIZ_URL            서버가 듣는 주소                      (기본 http://localhost:5080)
//   QUIZ_PUBLIC_ORIGIN  밖에서 접속하는 주소                  (예: https://quiz.example.com)
//   QUIZ_PASSWORD       접속 비밀번호. 밖에 공개할 때는 필수
//   QUIZ_SQL_HOST       MSSQL 주소. off 면 SQL 실행을 끈다    (기본 localhost,1433)
//   QUIZ_SQL_PASSWORD   MSSQL sa 비밀번호
const string LocalUrl = "http://localhost:5080";
var listenUrl = Environment.GetEnvironmentVariable("QUIZ_URL") ?? LocalUrl;
var publicOrigin = Environment.GetEnvironmentVariable("QUIZ_PUBLIC_ORIGIN")?.TrimEnd('/');
var password = Environment.GetEnvironmentVariable("QUIZ_PASSWORD");
var publicHost = publicOrigin is null ? null : new Uri(publicOrigin).Host;

// 이 서버는 받은 코드를 그대로 실행한다. 비밀번호 없이 밖에 열리는 일은 없어야 한다.
if ((publicOrigin is not null || listenUrl != LocalUrl) && string.IsNullOrEmpty(password))
    throw new InvalidOperationException("localhost 밖에서 접속하게 하려면 QUIZ_PASSWORD를 반드시 설정해야 합니다.");

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(listenUrl);
var app = builder.Build();

app.Use(async (ctx, next) =>
{
    // ① 이 서버의 화면에서 보낸 요청만 받는다(다른 사이트가 몰래 보내는 요청 차단).
    var host = ctx.Request.Host.Host;
    var origin = ctx.Request.Headers.Origin.ToString();
    if ((host != "localhost" && host != publicHost) || (origin != "" && origin != LocalUrl && origin != publicOrigin))
    {
        ctx.Response.StatusCode = 403;
        return;
    }
    // ② 화면과 문제는 누구나 본다. 코드 실행(/run)과 내 학습 기록(/api)만 비밀번호를 요구한다(브라우저 기본 로그인 창).
    if ((ctx.Request.Path.StartsWithSegments("/run") || ctx.Request.Path.StartsWithSegments("/api"))
        && !string.IsNullOrEmpty(password) && !HasPassword(ctx.Request.Headers.Authorization.ToString(), password))
    {
        // ponytail: 틀리면 1초 늦게 답할 뿐 잠금은 없다. 무차별 대입이 걱정되면 앞단(프록시)에서 횟수 제한을 건다.
        await Task.Delay(1000);
        ctx.Response.StatusCode = 401;
        ctx.Response.Headers.WWWAuthenticate = "Basic realm=\"quiz\", charset=\"UTF-8\"";
        return;
    }
    await next();
});
app.UseDefaultFiles();
// 배포하면 바로 새 파일을 쓰도록 매번 서버에 확인한다(바뀌지 않았으면 304 로 짧게 끝난다).
// 확인하지 않으면 브라우저가 옛 app.js 를 새 index.html 과 섞어 써서 화면이 깨진다.
app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = "no-cache" });

var sqlHost = Environment.GetEnvironmentVariable("QUIZ_SQL_HOST") ?? "localhost,1433";
var connStr = new SqlConnectionStringBuilder
{
    DataSource = sqlHost == "off" ? "localhost" : sqlHost,
    UserID = "sa",
    Password = Environment.GetEnvironmentVariable("QUIZ_SQL_PASSWORD") ?? "",
    TrustServerCertificate = true,
    Pooling = false,
}.ConnectionString;

// ponytail: 한 번에 하나만 실행한다(연습용 DB와 임시 파일을 같이 쓴다). 여러 명이 쓰게 되면 실행마다 DB를 따로 만든다.
var gate = new SemaphoreSlim(1, 1);

// 일본어 학습지: 같은 화면을 열고 app.js 가 주소(/ja)를 보고 일본어 문제만 보여 준다.
// /ja/ 로 오면 q/*.js 같은 상대 경로가 /ja/q/ 로 풀리므로 /ja 로 보낸다.
app.MapGet("/ja", (HttpContext ctx) =>
{
    if (ctx.Request.Path.Value!.EndsWith('/')) return Results.Redirect("/ja");
    ctx.Response.Headers.CacheControl = "no-cache";
    return Results.File(Path.Combine(app.Environment.WebRootPath, "index.html"), "text/html; charset=utf-8");
});
app.MapLearn();
app.MapPost("/run/sql", (RunRequest req) => Locked(() => RunSql(req)));
app.MapPost("/run/{lang}", (string lang, RunRequest req) => Locked(() => RunCode(lang, req.Code)));
app.Run();

// "Authorization: Basic base64(아이디:비밀번호)" 에서 비밀번호만 확인한다. 아이디는 아무거나 된다.
static bool HasPassword(string header, string expected)
{
    if (!header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase)) return false;
    try
    {
        var pair = Encoding.UTF8.GetString(Convert.FromBase64String(header[6..]));
        var given = Encoding.UTF8.GetBytes(pair[(pair.IndexOf(':') + 1)..]);
        return CryptographicOperations.FixedTimeEquals(given, Encoding.UTF8.GetBytes(expected));
    }
    catch (FormatException)
    {
        return false;
    }
}

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
    if (sqlHost == "off")   // MSSQL을 띄울 수 없는 작은 서버용
    {
        output.Add(new { type = "error", text = "이 서버에는 MSSQL이 없어서 SQL 실행을 꺼 두었어요. 내 컴퓨터에서 run.sh 로 켠 학습지에서는 실행됩니다." });
        return new { output, tables };
    }
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
        psi.Environment.Remove("QUIZ_PASSWORD");       // 실행되는 코드에 비밀 값을 넘기지 않는다
        psi.Environment.Remove("QUIZ_SQL_PASSWORD");
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
