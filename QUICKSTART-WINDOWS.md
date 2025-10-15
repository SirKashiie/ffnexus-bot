# QUICKSTART – WINDOWS

## 1) Node 20 LTS
- Com NVM: `nvm install 20.17.0 && nvm use 20.17.0`
- Confirme: `node -v` → v20.x

## 2) Instalar deps
```powershell
npm i
```

## 3) Configurar .env
```powershell
Copy-Item .env.example .env
notepad .env
```

## 4) Registrar /report
```powershell
npm run register
```

## 5) Rodar MCP (outra janela)
```powershell
npm run mcp
```

## 6) Subir o bot
```powershell
npm run dev
```
