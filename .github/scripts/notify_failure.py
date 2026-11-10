"""Sends the "build failed" e-mail. Everything comes from environment variables injected by the CI:

  SMTP_HOST, SMTP_PORT              mail server (not secret; 465 = SSL, 587 = STARTTLS)
  SMTP_USERNAME, SMTP_PASSWORD      credentials (GitHub secrets; never printed)
  MAIL_TO                           comma-separated recipients (workflow parameter `recipients`)
  BUILD_NUMBER, COMMIT, BRANCH, ENVIRONMENT, LOG_URL
  NEEDS_JSON                        `toJSON(needs)` of the notify job: the result of every stage

Set DRY_RUN=1 to print the message instead of sending it.
"""
import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage

# Pipeline order: the first stage that did not succeed is the one that failed.
STAGES = {
    "lint": "Lint",
    "unit": "Unitarias + cobertura",
    "build": "Build del artefacto",
    "deploy": "Despliegue",
    "integration": "Integración",
    "e2e": "End-to-end",
}


def failed_stage(needs: dict) -> str:
    for job_id, label in STAGES.items():
        result = needs.get(job_id, {}).get("result")
        if result == "failure":
            return f"{label} (falló)"
        if result == "cancelled":
            return f"{label} (cancelada o superó su tiempo máximo)"
    return "desconocida (ver el log)"


def build_message(env: dict, needs: dict) -> EmailMessage:
    stage = failed_stage(needs)
    msg = EmailMessage()
    msg["Subject"] = f"[Nodus Sonare] Build #{env['BUILD_NUMBER']} en rojo: {stage} ({env['ENVIRONMENT']})"
    msg["From"] = env["SMTP_USERNAME"]
    msg["To"] = env["MAIL_TO"]
    lines = [
        "El pipeline de Nodus Sonare falló.",
        "",
        f"Build:          #{env['BUILD_NUMBER']}",
        f"Commit:         {env['COMMIT']}",
        f"Rama:           {env.get('BRANCH', '')}",
        f"Ambiente:       {env['ENVIRONMENT']}",
        f"Etapa que falló: {stage}",
        f"Log:            {env['LOG_URL']}",
        "",
        "Resultado de cada etapa:",
    ]
    lines += [f"  - {label}: {needs[job]['result']}" for job, label in STAGES.items() if job in needs]
    msg.set_content("\n".join(lines))
    return msg


def main() -> int:
    env = os.environ
    needs = json.loads(env.get("NEEDS_JSON") or "{}")
    msg = build_message(env, needs)
    recipients = [r.strip() for r in env["MAIL_TO"].split(",") if r.strip()]

    if env.get("DRY_RUN") == "1":
        print(f"Subject: {msg['Subject']}\nTo: {msg['To']}\n\n{msg.get_content()}")
        return 0

    host, port = env["SMTP_HOST"], int(env["SMTP_PORT"])
    password = env["SMTP_PASSWORD"].replace(" ", "")  # app passwords are often copied with spaces
    print(f"Sending to {', '.join(recipients)} through {host}:{port} as {env['SMTP_USERNAME']}")
    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as smtp:
            smtp.login(env["SMTP_USERNAME"], password)
            smtp.send_message(msg, to_addrs=recipients)
    else:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.starttls(context=context)
            smtp.login(env["SMTP_USERNAME"], password)
            smtp.send_message(msg, to_addrs=recipients)
    print("Mail sent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
