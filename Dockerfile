# Stage 1: Build the Angular Client
FROM node:22 AS client-build
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

# Install ffmpeg, python3, and nginx
RUN apt-get update && \
    apt-get install -y ffmpeg python3 nginx && \
    rm -rf /var/lib/apt/lists/*

USER root

# Copy .NET API
COPY --from=server-build /app/publish .

# Copy Angular Client into the exact path expected by Program.cs (fallback) and Nginx
COPY --from=client-build /src/client/dist/tgnmsckmdck-client/browser /client/dist/tgnmsckmdck-client/browser
COPY --from=client-build /src/client/dist/tgnmsckmdck-client/browser /usr/share/nginx/html

# Write Nginx configuration
RUN echo 'server {\n\
    listen 3001;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    \n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    \n\
    location /api/ {\n\
        proxy_pass http://127.0.0.1:5000/api/;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Upgrade $http_upgrade;\n\
        proxy_set_header Connection keep-alive;\n\
        proxy_set_header Host $host;\n\
        proxy_cache_bypass $http_upgrade;\n\
    }\n\
    \n\
    location /audio/ {\n\
        proxy_pass http://127.0.0.1:5000/audio/;\n\
    }\n\
}' > /etc/nginx/sites-available/default

# Expose the persistent data directory (for sqlite DB and MP3 media files)
VOLUME ["/data"]

EXPOSE 3001
ENV ASPNETCORE_URLS=http://127.0.0.1:5000

# Start nginx in the background and the .NET API in the foreground
ENTRYPOINT ["/bin/sh", "-c", "service nginx start && dotnet TgnmsckmdckApi.dll"]
