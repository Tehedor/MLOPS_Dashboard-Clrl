# Runner Terminal

## Instalar tmux y cloudflare

```bash 
# Descargar el binario (ejemplo para Linux x86_64)
wget -O ttyd https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64
chmod +x ttyd
sudo mv ttyd /usr/local/bin/

# Ejecutar ttyd con protección de contraseña (¡CRÍTICO!)
ttyd -c tu_usuario:tu_contraseña_del_env bash
```

ctr+z - 
```bash 
bg
```

```bash 
#!/bin/bash

echo "🚀 1. Actualizando paquetes básicos..."
sudo apt update && sudo apt install -y wget curl

echo "🚀 2. Instalando ttyd (Terminal Web)..."
# Descarga el binario precompilado
sudo wget -O /usr/local/bin/ttyd https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64
sudo chmod +x /usr/local/bin/ttyd

echo "🚀 3. Instalando cloudflared (Túnel)..."
# Descarga e instala el paquete oficial de Cloudflare
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb

echo "✅ Instalación completada."
echo "⚠️  Siguiente paso: Debes autenticar la máquina ejecutando: cloudflared tunnel login"
```

## Configurar terminal en vm

vim setup_terminal.sh
```bash 
#!/bin/bash

# --- CONFIGURACIÓN ---
DOMAIN="tehelab.com"
# BASE_SUBDOMAIN="terminales"      
PORT=7681                        
TUNNEL_NAME="runner-esp32-tunnel2" 

if [ -z "$1" ]; then
    echo "Uso: ./setup_terminal.sh <nombre-subdominio>"
    exit 1
fi

SUBDOMAIN=$1
FULL_FQDN="$SUBDOMAIN.$DOMAIN"
# FULL_FQDN="$SUBDOMAIN.$BASE_SUBDOMAIN.$DOMAIN"

echo "🚀 Iniciando configuración para: $FULL_FQDN"

# 1. Matar procesos anteriores automáticamente
pkill -f ttyd
sleep 1

# 2. Crear el túnel
cloudflared tunnel create $TUNNEL_NAME > /dev/null 2>&1

# 3. Extraer el ID del túnel (A prueba de balas con sed)
TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | head -n 1 | sed 's/[[:space:]].*//')

if [ -z "$TUNNEL_ID" ]; then
    echo "❌ Error: No se pudo obtener el ID del túnel."
    exit 1
fi

# 4. Configurar el DNS en Cloudflare
echo "🌐 Vinculando $FULL_FQDN al túnel..."
cloudflared tunnel route dns $TUNNEL_NAME $FULL_FQDN > /dev/null 2>&1

# 5. Crear el archivo de configuración temporal
cat <<EOF > config.yaml
tunnel: $TUNNEL_ID
credentials-file: /home/$USER/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $FULL_FQDN
    service: http://localhost:$PORT
  - service: http_status:404
EOF

echo "✅ Archivo config.yaml generado correctamente (ID: $TUNNEL_ID)"

# 6. Cargar credenciales del .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo "🖥️  Arrancando ttyd en el puerto $PORT..."
if [ -n "$TERMINAL_USER" ] && [ -n "$TERMINAL_PASS" ]; then
    ttyd -p $PORT -c "$TERMINAL_USER:$TERMINAL_PASS" bash &
else
    ttyd -p $PORT bash &
fi

echo "☁️  Arrancando Cloudflare Tunnel..."
cloudflared tunnel --config config.yaml run $TUNNEL_NAME
```

Darle permisos de ejecución
```bash 
chmod +x setup_terminal.sh
```

.env
```
TERMINAL_USER=admin
TERMINAL_PASS=tu_clave_segura
```

terminalESP es el nombre que va delante de subdominio
```bash 
./setup_terminal.sh terminalESP
```

## Como debería de quedar
```bash 
runner@MLOPSRunner1:~$ ss -ultnp
Netid      State       Recv-Q      Send-Q           Local Address:Port             Peer Address:Port      Process                                      
udp        UNCONN      0           0                            *:57344                       *:*          users:(("cloudflared",pid=44938,fd=9))      
udp        UNCONN      0           0                            *:46322                       *:*          users:(("cloudflared",pid=44938,fd=7))      
udp        UNCONN      0           0                            *:34114                       *:*          users:(("cloudflared",pid=44938,fd=8))      
udp        UNCONN      0           0                            *:37755                       *:*          users:(("cloudflared",pid=44938,fd=6))      
tcp        LISTEN      0           128                    0.0.0.0:7681                  0.0.0.0:*          users:(("ttyd",pid=44937,fd=12))            
tcp        LISTEN      0           4096                 127.0.0.1:20241                 0.0.0.0:*          users:(("cloudflared",pid=44938,fd=3))      
tcp        LISTEN      0           4096                         *:22                          *:*                                                      
runner@MLOPSRunner1:~$ 
```


## Comando para eliminar
```bash 
sudo pkill -9 -f ttyd
sudo pkill -9 -f cloudflared
```

Eliminar el Túnel de Cloudflare
```bash 
# cloudflared tunnel delete runner-esp32-tunnel
cloudflared tunnel delete -f runner-esp32-tunnel
```