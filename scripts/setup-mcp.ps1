# ===============================================
# 🚀 Setup MCP + Discord Bot - FFNexus
# ===============================================
Write-Host ""
Write-Host "==============================================="
Write-Host "🚀 Iniciando FFNexus Bot + Secure MCP Server..."
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Caminho base
$BasePath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootPath = Resolve-Path "$BasePath\.."

# Garante que a pasta data exista
$dataPath = Join-Path $RootPath "data"
if (!(Test-Path $dataPath)) {
    New-Item -ItemType Directory -Path $dataPath | Out-Null
    Write-Host "📂 Pasta criada: $dataPath"
}

# Garante que keywords.json exista
$keywordsPath = Join-Path $dataPath "keywords.json"
if (!(Test-Path $keywordsPath)) {
    $defaultKeywords = @(
        "passe booyah", "booyah", "skin", "lag", "bug", "travando",
        "caro", "barato", "horrível", "ótimo", "bundle", "token", "royale"
    )
    $json = $defaultKeywords | ConvertTo-Json -Depth 3
    Set-Content -Path $keywordsPath -Value $json -Encoding UTF8
    Write-Host "📝 Criado arquivo padrão: $keywordsPath"
} else {
    Write-Host "✅ keywords.json já existe."
}

# Executa MCP e Bot em janelas separadas
Write-Host ""
Write-Host "🧠 Iniciando servidor MCP..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run mcp" -WorkingDirectory $RootPath

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "🤖 Iniciando o bot..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WorkingDirectory $RootPath

Write-Host ""
Write-Host "✅ Tudo pronto!"
Write-Host "-----------------------------------------------"
Write-Host "MCP Filesystem e FFNexus Bot rodando."
Write-Host "-----------------------------------------------"
Write-Host ""
