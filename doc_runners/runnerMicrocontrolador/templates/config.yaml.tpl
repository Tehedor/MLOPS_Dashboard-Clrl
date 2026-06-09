tunnel: __TUNNEL_ID__
credentials-file: /home/__RUN_USER__/.cloudflared/__TUNNEL_ID__.json

ingress:
  - hostname: __FULL_FQDN__
    service: http://localhost:__PORT__
  - service: http_status:404