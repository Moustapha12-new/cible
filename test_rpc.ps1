# ============================================================================
# CIBLE — Test RPC via PowerShell
# Usage: powershell -ExecutionPolicy Bypass -File test_rpc.ps1
# Nécessite .env.local avec SUPABASE_SERVICE_ROLE_KEY
# ============================================================================

# Charger les variables d'environnement depuis .env.local
if (Test-Path ".env.local") {
    $envContent = Get-Content ".env.local" -Raw
    $envLines = $envContent -split "`n"
    foreach ($line in $envLines) {
        if ($line -match "^([^#=]+)=(.*)$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($value -match '^".*"$' -or $value -match "^'.*'$") {
                $value = $value.Substring(1, $value.Length - 2)
            }
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

$key = $env:SUPABASE_SERVICE_ROLE_KEY
if (-not $key) {
    Write-Error "SUPABASE_SERVICE_ROLE_KEY non trouvé dans .env.local"
    exit 1
}

$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
}
$body = '{"p_key":"test:rest:verify","p_limit":1}'
$response = Invoke-WebRequest -Method Post -Uri "https://ucgetwemaxigkblzvndo.supabase.co/rest/v1/rpc/cible_take_quota" -Headers $headers -Body $body -ContentType "application/json"
Write-Host "Status: $($response.StatusCode)"
Write-Host "StatusDescription: $($response.StatusDescription)"
Write-Host "Content: $($response.Content)"