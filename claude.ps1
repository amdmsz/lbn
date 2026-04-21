# ====================== claude.ps1 (jiekou.ai Opus 4.7 - 升级记忆版) ======================
$API_KEY = "sk_EaNBV5z6cCJdsit35HmtPsVlvVT-Q9EMrydgR0DtfU8"
$MODEL_ID = "claude-opus-4-7"
$BASE_URL = "https://api.jiekou.ai/openai"

# UTF-8 强制设置
chcp 65001 | Out-Null
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ==================== 对话历史（记忆核心）====================
$history = @(
    @{ role = "system"; content = "You are Claude Opus 4.7, the most powerful coding and agent-building assistant. You excel at software engineering, architecture, debugging, writing clean code, and building complex AI agents. Always respond in the same language as the user. Be concise but extremely helpful." }
)

$historyFile = ".\chat_history.json"

# 启动时自动加载上次对话
if (Test-Path $historyFile) {
    try {
        $saved = Get-Content $historyFile -Raw | ConvertFrom-Json
        $history = @($saved)
        Write-Host "✅ 已自动加载上次对话记录 ($($history.Count - 1) 条消息)" -ForegroundColor Green
    } catch {}
}

Write-Host "🚀 Claude Opus 4.7 (jiekou.ai) 记忆版 已启动！" -ForegroundColor Cyan
Write-Host "支持完整对话记忆 + 快捷指令 (/help 查看)" -ForegroundColor Cyan

while ($true) {
    $userInput = Read-Host "`n你: "

    if ($userInput -eq "exit" -or $userInput -eq "quit") { 
        # 自动保存
        $history | ConvertTo-Json -Depth 10 | Out-File $historyFile -Encoding utf8
        Write-Host "💾 对话已自动保存" -ForegroundColor Green
        break 
    }

    # 处理快捷指令
    if ($userInput -eq "/clear") {
        $history = @($history[0])  # 只保留 system prompt
        Write-Host "🧹 对话历史已清空" -ForegroundColor Yellow
        continue
    }
    if ($userInput -eq "/history") {
        Write-Host "📊 当前记忆: $($history.Count - 1) 条消息" -ForegroundColor Cyan
        continue
    }
    if ($userInput -eq "/save") {
        $history | ConvertTo-Json -Depth 10 | Out-File $historyFile -Encoding utf8
        Write-Host "💾 已手动保存到 chat_history.json" -ForegroundColor Green
        continue
    }
    if ($userInput -eq "/load") {
        if (Test-Path $historyFile) {
            $saved = Get-Content $historyFile -Raw | ConvertFrom-Json
            $history = @($saved)
            Write-Host "✅ 已加载历史对话 ($($history.Count - 1) 条)" -ForegroundColor Green
        }
        continue
    }
    if ($userInput -eq "/help") {
        Write-Host "`n可用指令：" -ForegroundColor Cyan
        Write-Host "  /clear   清空记忆" -ForegroundColor White
        Write-Host "  /history 显示记忆长度" -ForegroundColor White
        Write-Host "  /save    手动保存对话" -ForegroundColor White
        Write-Host "  /load    加载保存的对话" -ForegroundColor White
        Write-Host "  exit     退出并自动保存" -ForegroundColor White
        continue
    }

    # 添加用户消息
    $history += @{ role = "user"; content = $userInput }

    $body = @{
        model      = $MODEL_ID
        messages   = $history
        max_tokens = 128000
        stream     = $false
    } | ConvertTo-Json -Depth 10

    try {
        $jsonBody = [System.Text.Encoding]::UTF8.GetBytes($body)

        $response = Invoke-RestMethod `
            -Uri "$BASE_URL/v1/chat/completions" `
            -Method Post `
            -Headers @{
                "Content-Type"  = "application/json; charset=utf-8"
                "Authorization" = "Bearer $API_KEY"
            } `
            -Body $jsonBody

        $reply = $response.choices[0].message.content

        # 添加助手回复到记忆
        $history += @{ role = "assistant"; content = $reply }

        Write-Host "`nClaude: " -ForegroundColor Green -NoNewline
        Write-Host $reply
    }
    catch {
        Write-Host "`n❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorStream)
            $errorBody = $reader.ReadToEnd()
            Write-Host "API Detailed Error: $errorBody" -ForegroundColor Yellow
        }
        # 出错时移除刚加入的用户消息
        $history = $history[0..($history.Count-2)]
    }
}
# =====================================================================