# 학습지 서버와, 문제의 코드를 실행할 도구(C#, Node, TypeScript, Rust)를 한 이미지에 담는다.
# 실행되는 코드는 이 컨테이너 안에 갇힌다.
FROM mcr.microsoft.com/dotnet/sdk:10.0

# Node 22 (JavaScript · TypeScript 실행), Rust 컴파일러
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && apt-get update && apt-get install -y --no-install-recommends rustc gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY quiz.csproj ./
RUN dotnet restore
COPY *.cs ./
COPY wwwroot ./wwwroot
RUN dotnet publish -c Release -o /app/out --no-restore

# 관리자 권한 없이 실행한다.
# 학습 기록 DB(/data/learn.db)는 볼륨에 둔다. 다시 빌드해도 남는다.
RUN useradd --create-home quiz && mkdir /data && chown quiz /data
USER quiz
ENV DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 QUIZ_URL=http://0.0.0.0:5080 QUIZ_DATA=/data

# C# 한 파일 실행을 미리 한 번 돌려 둔다. 그래야 인터넷이 막힌 상태에서도 바로 실행된다.
RUN mkdir /tmp/warm && cd /tmp/warm && echo 'Console.WriteLine("ready");' > Snippet.cs \
 && dotnet run Snippet.cs && cd / && rm -rf /tmp/warm

EXPOSE 5080
CMD ["dotnet", "/app/out/quiz.dll"]
