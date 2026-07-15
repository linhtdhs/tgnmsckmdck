# Stage 1: Build the Angular Client
FROM node:20 AS client-build
WORKDIR /src/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Build the .NET API
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS server-build
WORKDIR /src
COPY server/*.csproj ./server/
COPY client/*.esproj ./client/
RUN dotnet restore server/TgnmsckmdckApi.csproj
COPY . ./
WORKDIR /src/server
RUN dotnet publish TgnmsckmdckApi.csproj -c Release -o /app/publish /p:UseAppHost=false

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Install ffmpeg and python3 which are required by yt-dlp to convert to mp3
RUN apt-get update && \
    apt-get install -y ffmpeg python3 && \
    rm -rf /var/lib/apt/lists/*

# The app resolves paths dynamically using AppContext.BaseDirectory and goes up 5 levels:
# - data/db goes to /data
# - yt-dlp binary goes to /bin
# - angular app goes to /client/dist/tgnmsckmdck-client/browser
# By running as root, the container has permission to write to these directories.
USER root

# Copy .NET API
COPY --from=server-build /app/publish .

# Copy Angular Client into the exact path expected by Program.cs
COPY --from=client-build /src/client/dist/tgnmsckmdck-client/browser /client/dist/tgnmsckmdck-client/browser

# Expose the persistent data directory (for sqlite DB and MP3 media files)
VOLUME ["/data"]

EXPOSE 3001
ENV ASPNETCORE_URLS=http://+:3001

ENTRYPOINT ["dotnet", "TgnmsckmdckApi.dll"]
