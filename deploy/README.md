# Deploy no VPS (Ubuntu 22.04 / 24.04)

## Passo 1 — Preparar repositório

No seu PC (local):

```bash
cd C:\Projetos\Avaliações
git init
git add .
git commit -m "Setup inicial"
```

Cria um repositório privado no GitHub e:

```bash
git remote add origin git@github.com:SEU_USUARIO/avaliacoes.git
git push -u origin main
```

## Passo 2 — Instalar dependências no VPS

Conecte via SSH e rode:

```bash
# Node 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git

# PM2 global (se ainda não tiver)
sudo npm install -g pm2

# Confirma versões
node -v   # v20.x
npm -v
nginx -v
```

## Passo 3 — Clonar e buildar

```bash
cd /var/www
sudo mkdir avaliacoes && sudo chown $USER:$USER avaliacoes
cd avaliacoes
git clone git@github.com:SEU_USUARIO/avaliacoes.git .

# Cria o .env.local do admin (use nano ou vim)
nano apps/admin/.env.local
# → cole o conteúdo do seu .env.local local, mas mude:
#     NEXT_PUBLIC_APP_URL=http://SEU_DOMINIO_OU_IP
# Salvar (Ctrl+X, Y, Enter)

# Cria também o .env.local do widget com a URL de produção
nano apps/widget/.env.local
# → VITE_SUPABASE_URL=https://xxxx.supabase.co
#   VITE_SUPABASE_ANON_KEY=eyJ...
#   VITE_ADMIN_URL=http://SEU_DOMINIO_OU_IP

npm install
npm run build     # builda shared + widget (copia pro public) + admin
```

## Passo 4 — Rodar com PM2

```bash
cd /var/www/avaliacoes
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup       # gera o comando pro sistema startar o PM2 no boot
# copie e cole o comando que ele imprime
```

Confirme:

```bash
pm2 status              # deve aparecer avaliacoes-admin online
pm2 logs avaliacoes-admin
curl http://127.0.0.1:3000  # deve devolver HTML do painel
```

## Passo 5 — Nginx reverse proxy

```bash
sudo cp deploy/nginx-avaliacoes.conf /etc/nginx/sites-available/avaliacoes
# edita e troca SEU_DOMINIO_OU_IP
sudo nano /etc/nginx/sites-available/avaliacoes

sudo ln -s /etc/nginx/sites-available/avaliacoes /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default   # opcional
sudo nginx -t
sudo systemctl reload nginx
```

Se estiver com firewall (ufw):

```bash
sudo ufw allow 'Nginx Full'
```

Agora acesse http://SEU_DOMINIO_OU_IP no navegador — deve abrir o painel.

## Passo 6 — Reconfigurar Nuvemshop

No portal de parceiros (partners.nuvemshop.com.br), edita o App:

- **Site do aplicativo**: `http://SEU_DOMINIO_OU_IP`
- **URL de redirecionamento**: `http://SEU_DOMINIO_OU_IP/api/nuvemshop/callback`

Salva. **Desinstala e reinstala** o app na sua loja (senão fica com o access_token antigo).

## Passo 7 — Cron de envio (e-mail/WhatsApp)

O mesmo endpoint processa solicitações de avaliação, consulta carrinhos
abandonados na Nuvemshop e envia as mensagens de recuperação/pós-venda.

Como não vamos usar Vercel Cron, agenda com o cron do próprio Linux:

```bash
crontab -e
```

Cola no fim:

```
*/30 * * * * curl -s -X POST -H "x-cron-secret: SEU_CRON_SECRET" http://127.0.0.1:3002/api/cron/send-requests > /dev/null 2>&1
```

Substitua `SEU_CRON_SECRET` pelo valor de `CRON_SECRET` do `.env.local`.

## Atualizações futuras

Quando você fizer mudanças no código:

```bash
cd /var/www/avaliacoes
git pull
npm install         # se mudou dependências
npm run build
pm2 restart avaliacoes-admin
```

## HTTPS (recomendado, quando tiver domínio)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d avaliacoes.sualoja.com.br
```

O certbot renova sozinho a cada 3 meses via systemd timer.

Depois, ajuste no `.env.local`:

```
NEXT_PUBLIC_APP_URL=https://avaliacoes.sualoja.com.br
```

E rebuilda:

```bash
npm run build && pm2 restart avaliacoes-admin
```

Volte no admin da Nuvemshop e ajuste as URLs pra HTTPS também.

## Troubleshooting

- **502 Bad Gateway** → `pm2 logs` pra ver se o app crashou
- **Widget não carrega no site** → Mixed Content: HTTPS na loja + HTTP no widget não rola. Precisa HTTPS.
- **OAuth callback falha** → confere que a URL na Nuvemshop bate exatamente com o que está em `NEXT_PUBLIC_APP_URL`
