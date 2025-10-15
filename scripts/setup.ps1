# ===========================================
#  Discord Report Bot — Setup Automático (Windows PowerShell)
# ===========================================
# Cria estrutura de pastas, instala dependências e gera .env base.
# Executar com:
#   powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
# ===========================================

Write-Host "Iniciando setup do Discord Report Bot..." -ForegroundColor Cyan

# -------------------------------
# 1) Verifica Node.js
# -------------------------------
$nodeVersion = node -v 2>$null
if (-not $?) {
    Write-Host "ERRO: Node.js não encontrado. Instale a versão 20.x antes de prosseguir." -ForegroundColor Red
    exit 1
}
Write-Host "Node.js detectado: $nodeVersion" -ForegroundColor Green

# -------------------------------
# 2) Criação de pastas básicas
# -------------------------------
$folders = @("data", "docs", "secrets", "src")
foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder | Out-Null
        Write-Host "Criado diretório: $folder"
    }
}

# -------------------------------
# 3) Criação do arquivo .env se não existir
# -------------------------------
if (-not (Test-Path ".env")) {
    Write-Host "Criando arquivo .env padrão..."
    $envContent = @"
DISCORD_TOKEN=
CLIENT_ID=
GUILD_IDS=

# ==== /feedback ====
SOURCE_CHANNEL_IDS=
DEST_CHANNEL_ID=
ALLOWED_ROLE_IDS=

MIRROR_REALTIME=false
POST_RAW_MESSAGES_ON_CONFIRM=true
POST_RAW_LIMIT=50
POST_RAW_ATTACHMENTS=true

# ==== Diários ====
DIARIO_CONSELHEIRO_CHANNEL_IDS=
DIARIO_APRENDIZ_CHANNEL_IDS=

# ==== n8n ====
N8N_REPORT_WEBHOOK_URL=
N8N_DOC_WEBHOOK_URL=

# ==== Apify ====
APIFY_TOKEN=
APIFY_DATASET_ID=

# ==== Docs ====
DOCS_PROVIDER=local
DOCS_DIR=./docs
GDRIVE_FOLDER_ID=
GDRIVE_SA_KEY_FILE=./secrets/sa.json

# ==== Índice ====
DOCS_REINDEX_ON_BOOT=true

# ==== Filtros feedback ====
MIN_SCORE=3
REQUIRE_DOMAIN=true
MIN_WORDS=3

TIMEZONE=America/Sao_Paulo
REPORT_PASSWORD=
"@
    $envContent | Out-File -Encoding utf8 .env
    Write-Host ".env criado com sucesso."
}
else {
    Write-Host ".env já existe, mantendo original."
}

# -------------------------------
# 4) Instala dependências
# -------------------------------
Write-Host "Instalando dependências npm..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Falha ao instalar dependências npm." -ForegroundColor Red
    exit 1
}
Write-Host "Dependências instaladas com sucesso." -ForegroundColor Green

# -------------------------------
# 5) Criação do arquivo keywords.json inicial (MCP)
# -------------------------------
$keywordsPath = "data/keywords.json"
if (-not (Test-Path $keywordsPath)) {
    @("freefire","booyah","evento","skin","feedback","erro","lag","passe") | ConvertTo-Json | Out-File -Encoding utf8 $keywordsPath
    Write-Host "Arquivo keywords.json criado com exemplos iniciais."
}

# -------------------------------
# 6) Mensagem final
# -------------------------------
Write-Host ""
Write-Host "==========================================="
Write-Host "Setup completo!"
Write-Host "Agora edite o arquivo .env com seus dados do Discord e URLs do n8n."
Write-Host "Depois execute: npm run dev"
Write-Host ""
Write-Host "Dica: para registrar comandos Slash no servidor, use:"
Write-Host "   npm run register"
Write-Host ""
Write-Host "Bot pronto para uso!"
Write-Host "==========================================="
