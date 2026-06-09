[Unit]
Description=Terminal Web TTYD
After=network.target

[Service]
Type=simple
User=__RUN_USER__
WorkingDirectory=__PROJECT_DIR__
ExecStart=__TTYD__ -p __PORT__ -c "__TERMINAL_USER__:__TERMINAL_PASS__" bash
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target