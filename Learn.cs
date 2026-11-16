// 학습 기록 API(/api): 푼 문제 기록, 성장 통계, 내 단어장. SQLite 파일 하나(QUIZ_DATA/learn.db)에 저장한다.
// 비밀번호는 Program.cs 의 입구에서 확인한다. 사용자는 한 명(비밀번호를 아는 사람)이라 사용자 구분은 없다.
using Microsoft.Data.Sqlite;

static class Learn
{
    static readonly string[] Outcomes = ["ok", "hint", "bad", "skip"];
    static readonly int[] Interval = [1, 3, 7, 14, 30, 60];   // 단어 복습 간격(일). 맞히면 다음 칸, 틀리면 처음으로

    public static void MapLearn(this WebApplication app)
    {
        var dir = Environment.GetEnvironmentVariable("QUIZ_DATA") ?? Path.Combine(app.Environment.ContentRootPath, "data");
        Directory.CreateDirectory(dir);
        var cs = new SqliteConnectionStringBuilder { DataSource = Path.Combine(dir, "learn.db") }.ConnectionString;
        Exec(cs, """
            CREATE TABLE IF NOT EXISTS answers (id INTEGER PRIMARY KEY, at TEXT NOT NULL, qid TEXT NOT NULL,
                topic TEXT NOT NULL, kind TEXT NOT NULL, result TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS words (id INTEGER PRIMARY KEY, word TEXT NOT NULL UNIQUE, reading TEXT NOT NULL,
                meaning TEXT NOT NULL, added TEXT NOT NULL, box INTEGER NOT NULL DEFAULT 0, due TEXT NOT NULL,
                seen INTEGER NOT NULL DEFAULT 0, known INTEGER NOT NULL DEFAULT 0);
            """);

        app.MapGet("/api/me", () => new { ok = true });

        app.MapPost("/api/answers", (AnswerIn a) =>
        {
            if (!Outcomes.Contains(a.Result) || Bad(a.Qid, a.Topic, a.Kind)) return Results.BadRequest();
            Exec(cs, "INSERT INTO answers (at, qid, topic, kind, result) VALUES (datetime('now'), $q, $t, $k, $r)",
                ("$q", a.Qid), ("$t", a.Topic), ("$k", a.Kind), ("$r", a.Result));
            return Results.Ok();
        });

        // 맞힌 비율은 (ok + hint) / 전체. 날짜는 한국 시간, 주는 월요일부터.
        const string Rate = "COUNT(*) AS n, SUM(result IN ('ok','hint')) AS ok";
        // p: 문제 id 앞부분(JP 일본어, GK 상식). 학습지마다 기록을 따로 본다.
        app.MapGet("/api/stats", (string? p) =>
        {
            var pre = ("$p", (object)((p ?? "") + "%"));
            const string Mine = "qid LIKE $p";
            return new
            {
                weeks = Query(cs, $"""
                    SELECT date(at, '+9 hours', 'weekday 0', '-6 days') AS week, {Rate}
                    FROM answers WHERE {Mine} AND at >= datetime('now', '-84 days') GROUP BY week ORDER BY week
                    """, pre),
                topics = Query(cs, $"""
                    SELECT topic, {Rate},
                           SUM(at >= datetime('now', '-7 days')) AS n7,
                           SUM(at >= datetime('now', '-7 days') AND result IN ('ok','hint')) AS ok7
                    FROM answers WHERE {Mine} GROUP BY topic ORDER BY topic
                    """, pre),
                kinds = Query(cs, $"SELECT kind, {Rate} FROM answers WHERE {Mine} GROUP BY kind ORDER BY n DESC", pre),
                days = Query(cs, $"""
                    SELECT date(at, '+9 hours') AS day, {Rate} FROM answers
                    WHERE {Mine} AND at >= datetime('now', '-28 days') GROUP BY day ORDER BY day
                    """, pre),
                weak = Query(cs, $"""
                    SELECT qid, topic, COUNT(*) AS wrong FROM answers
                    WHERE {Mine} AND result IN ('bad','skip') AND at >= datetime('now', '-30 days')
                    GROUP BY qid ORDER BY wrong DESC LIMIT 10
                    """, pre),
                words = Query(cs, """
                    SELECT COUNT(*) AS total, SUM(due <= date('now', '+9 hours')) AS due, SUM(box >= 4) AS learned FROM words
                    """)[0],
            };
        });

        app.MapGet("/api/words", () => Query(cs, """
            SELECT id, word, reading, meaning, box, due, seen, known, due <= date('now', '+9 hours') AS isDue
            FROM words ORDER BY due, id
            """));

        app.MapPost("/api/words", (WordIn w) =>
        {
            if (string.IsNullOrWhiteSpace(w.Word) || Bad(w.Word, w.Reading ?? "", w.Meaning ?? "")) return Results.BadRequest();
            Exec(cs, """
                INSERT INTO words (word, reading, meaning, added, due) VALUES ($w, $r, $m, datetime('now'), date('now', '+9 hours'))
                ON CONFLICT(word) DO UPDATE SET reading = excluded.reading, meaning = excluded.meaning
                """, ("$w", w.Word.Trim()), ("$r", w.Reading?.Trim() ?? ""), ("$m", w.Meaning?.Trim() ?? ""));
            return Results.Ok();
        });

        // 복습: 알았으면 다음 칸으로(복습 간격이 늘어난다), 몰랐으면 첫 칸으로 돌아가 오늘 다시 본다.
        app.MapPost("/api/words/{id:long}/review", (long id, ReviewIn r) =>
        {
            var box = Convert.ToInt32(Query(cs, "SELECT box FROM words WHERE id = $id", ("$id", id)).FirstOrDefault()?["box"] ?? -1);
            if (box < 0) return Results.NotFound();
            var next = r.Known ? Math.Min(box + 1, Interval.Length) : 0;
            var days = next == 0 ? 0 : Interval[next - 1];
            Exec(cs, "UPDATE words SET box = $b, due = date('now', '+9 hours', $d), seen = seen + 1, known = known + $k WHERE id = $id",
                ("$b", next), ("$d", $"+{days} days"), ("$k", r.Known ? 1 : 0), ("$id", id));
            return Results.Ok();
        });

        app.MapDelete("/api/words/{id:long}", (long id) =>
        {
            Exec(cs, "DELETE FROM words WHERE id = $id", ("$id", id));
            return Results.Ok();
        });
    }

    static bool Bad(params string[] s) => s.Any(x => x is null || x.Length > 300);

    static void Exec(string cs, string sql, params (string, object)[] ps)
    {
        using var c = new SqliteConnection(cs);
        c.Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (k, v) in ps) cmd.Parameters.AddWithValue(k, v);
        cmd.ExecuteNonQuery();
    }

    static List<Dictionary<string, object?>> Query(string cs, string sql, params (string, object)[] ps)
    {
        using var c = new SqliteConnection(cs);
        c.Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (k, v) in ps) cmd.Parameters.AddWithValue(k, v);
        using var r = cmd.ExecuteReader();
        var rows = new List<Dictionary<string, object?>>();
        while (r.Read())
        {
            var row = new Dictionary<string, object?>();
            for (var n = 0; n < r.FieldCount; n++) row[r.GetName(n)] = r.IsDBNull(n) ? null : r.GetValue(n);
            rows.Add(row);
        }
        return rows;
    }
}

record AnswerIn(string Qid, string Topic, string Kind, string Result);
record WordIn(string Word, string? Reading, string? Meaning);
record ReviewIn(bool Known);
