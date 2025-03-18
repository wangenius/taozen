# Git 自动提交脚本

# 错误处理
$ErrorActionPreference = "Stop"

try {
    # 检查是否有修改的文件
    $status = git status --porcelain
    if (-not $status) {
        Write-Host "没有需要提交的更改" -ForegroundColor Yellow
        exit 0
    }

    # 显示当前修改的文件
    Write-Host "`n当前修改的文件:" -ForegroundColor Cyan
    git status --short
    Write-Host ""

    # 获取当前分支
    $currentBranch = git rev-parse --abbrev-ref HEAD
    Write-Host "当前分支: $currentBranch" -ForegroundColor Cyan

    # 提示输入提交信息
    $commitMessage = Read-Host "请输入提交信息 (直接回车取消)"

    # 检查提交信息是否为空
    if ([string]::IsNullOrWhiteSpace($commitMessage)) {
        Write-Host "提交已取消" -ForegroundColor Yellow
        exit 0
    }

    # 执行 git 操作
    Write-Host "`n开始提交..." -ForegroundColor Green
    git add .
    git commit -m $commitMessage
    
    # 更新版本号
    npm version patch --no-git-tag-version
    $newVersion = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
    git add package.json
    git commit --amend -m "$commitMessage (v$newVersion)"

    # 确认是否推送
    $push = Read-Host "是否推送到远程? (Y/N)"
    if ($push -eq 'Y' -or $push -eq 'y') {
        git push origin $currentBranch
        Write-Host "`n提交并推送完成！" -ForegroundColor Green
        Write-Host "`n请等待完成npm仓库的自动化部署..." -ForegroundColor Green
    } else {
        Write-Host "`n本地提交完成，没有推送到远程。" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "`n错误: $_" -ForegroundColor Red
    exit 1
}