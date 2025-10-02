# create-files.ps1 — create folders and empty files (placeholders)
$ErrorActionPreference = 'Stop'

$paths = @(
  # root
  ".firebaserc",
  "database.rules.json",
  "firebase.json",
  "firestore.rules",
  "snapshot_all.txt",

  # functions
  "functions/.gitkeep",
  "functions/firebase.json",
  "functions/package.json",
  "functions/src/index.ts",

  # src
  "src/index.html",
  "src/main.ts",
  "src/main.server.ts",
  "src/server.ts",
  "src/styles.scss",

  # src/app
  "src/app/app.component.ts",
  "src/app/app.html",
  "src/app/app.scss",
  "src/app/app.config.ts",
  "src/app/app.config.server.ts",
  "src/app/app.routes.ts",
  "src/app/app.routes.server.ts",
  "src/app/app.spec.ts",
  "src/app/app.ts",

  # guards
  "src/app/guards/.gitkeep",
  "src/app/guards/admin.guard.ts",

  # models
  "src/app/models/.gitkeep",
  "src/app/models/event.model.ts",
  "src/app/models/room.model.ts",
  "src/app/models/stats.model.ts",

  # pages
  "src/app/pages/.gitkeep",
  "src/app/pages/dashboard.component.ts",
  "src/app/pages/events.component.ts",
  "src/app/pages/forbidden.component.ts",
  "src/app/pages/login.component.ts",
  "src/app/pages/room-detail.component.ts",
  "src/app/pages/rooms.component.ts",

  # services
  "src/app/services/.gitkeep",
  "src/app/services/monitor.service.ts",

  # shared
  "src/app/shared/.gitkeep",

  # environment
  "src/environnement/.gitkeep",
  "src/environnement/environment.ts",
  "src/environnement/environment.development.ts",

  # tools
  "tools/.gitkeep"
)

foreach ($p in $paths) {
  $dir = Split-Path -Parent $p
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  if ($p -like "*.gitkeep") {
    if (-not (Test-Path $p)) {
      New-Item -ItemType File -Path $p -Force | Out-Null
      Write-Host "Created $p"
    } else {
      Write-Host "Exists  $p"
    }
    continue
  }

  if (-not (Test-Path $p)) {
    New-Item -ItemType File -Path $p -Force | Out-Null
    Write-Host "Created $p"
  } else {
    Write-Host "Exists  $p"
  }
}

Write-Host ""
Write-Host "Done. Files created (empty). Open them in your editor and paste contents as needed."
