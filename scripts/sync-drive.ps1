$ErrorActionPreference = "Stop"

# Caminho do projeto
$repo = "C:\Cdev\discord-report-bot\discord-report-bot-full\discord-report-bot"
$dst  = Join-Path $repo "data\docs"

# Remote/pasta do seu Drive (ajuste se o nome/pasta forem diferentes)
$src  = "gdrive:BotDocs"

# Sincroniza e exporta Google Docs automaticamente para pdf/txt/csv
rclone sync $src $dst `
  --drive-export-formats pdf,txt,csv `
  --create-empty-src-dirs `
  --fast-list `
  --checksum `
  --progress
