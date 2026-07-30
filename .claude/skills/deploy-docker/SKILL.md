---
name: deploy-docker
description: Deploy rf_compliance_bot with Docker. Use when building, running, or configuring the bot in a container, or when troubleshooting lost channel settings and sessions after a container restart.
---

# Docker deployment

**The `/app/data` directory MUST be mounted as a volume.** The SQLite database (`channels.db`) holds both channel settings and user sessions; without the volume it lives in the container's writable layer and every restart silently wipes all configuration.

```bash
# Using docker run
docker run -v ./data:/app/data -e TELEGRAM_BOT_TOKEN=your_token your_image
```

```yaml
# Using docker-compose
services:
    bot:
        image: your_image
        volumes:
            - ./data:/app/data
        environment:
            - TELEGRAM_BOT_TOKEN=your_token
```

The database file `channels.db` will be stored in the mounted volume.

See [.env.example](../../../.env.example) for the full set of environment variables.
