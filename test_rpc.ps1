$key = "$env:SUPABASE_SERVICE_ROLE_KEY"
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