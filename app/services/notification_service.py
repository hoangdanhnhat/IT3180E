"""Email notification helpers for ticket events."""

import html
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from app.core.config import settings
from app.storage.models import Ticket, TicketStatus

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailTemplate:
    subject: str
    text_body: str
    html_body: str


def _ticket_url(ticket: Ticket) -> str:
    return f"{settings.APP_BASE_URL.rstrip('/')}/dashboard/tickets/{ticket.id}"


def _status_label(status: TicketStatus | None) -> str:
    if status is None:
        return "None"
    return status.value.replace("_", " ").title()


def _snippet(content: str, limit: int = 150) -> str:
    normalized = " ".join(content.split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit].rstrip()}..."


def format_reply_notification(
    *,
    ticket: Ticket,
    sender_name: str,
    reply_content: str,
) -> EmailTemplate:
    """Build a concise new-reply email in plain text and HTML."""
    snippet = _snippet(reply_content)
    ticket_url = _ticket_url(ticket)
    subject = f"[{ticket.ticket_number}] New reply from {sender_name}"

    text_body = (
        f"{sender_name} replied to ticket {ticket.ticket_number}.\n\n"
        f"{snippet}\n\n"
        f"View ticket: {ticket_url}"
    )
    html_body = (
        "<p>"
        f"<strong>{html.escape(sender_name)}</strong> replied to ticket "
        f"<strong>{html.escape(ticket.ticket_number)}</strong>."
        "</p>"
        f"<blockquote>{html.escape(snippet)}</blockquote>"
        f'<p><a href="{html.escape(ticket_url)}">View ticket</a></p>'
    )
    return EmailTemplate(subject=subject, text_body=text_body, html_body=html_body)


def format_status_change_notification(
    *,
    ticket: Ticket,
    actor_name: str,
    old_status: TicketStatus | None,
    new_status: TicketStatus,
    note: str | None = None,
) -> EmailTemplate:
    """Build a concise status-change email in plain text and HTML."""
    old_label = _status_label(old_status)
    new_label = _status_label(new_status)
    ticket_url = _ticket_url(ticket)
    subject = f"[{ticket.ticket_number}] Status changed to {new_label}"
    note_text = _snippet(note) if note else ""

    text_body = (
        f"{actor_name} changed ticket {ticket.ticket_number} from "
        f"{old_label} to {new_label}."
    )
    html_body = (
        "<p>"
        f"<strong>{html.escape(actor_name)}</strong> changed ticket "
        f"<strong>{html.escape(ticket.ticket_number)}</strong> from "
        f"<strong>{html.escape(old_label)}</strong> to "
        f"<strong>{html.escape(new_label)}</strong>."
        "</p>"
    )
    if note_text:
        text_body += f"\n\nNote: {note_text}"
        html_body += f"<blockquote>{html.escape(note_text)}</blockquote>"
    text_body += f"\n\nView ticket: {ticket_url}"
    html_body += f'<p><a href="{html.escape(ticket_url)}">View ticket</a></p>'
    return EmailTemplate(subject=subject, text_body=text_body, html_body=html_body)


def send_email(
    *,
    to_email: str | None,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> bool:
    """Send an email synchronously through the configured SMTP server."""
    if not to_email:
        logger.warning("Skipping email with subject %r: missing recipient", subject)
        return False
    if not settings.SMTP_PASSWORD:
        logger.warning(
            "Skipping email to %s with subject %r: SMTP_PASSWORD is not configured",
            to_email,
            subject,
        )
        return False

    message = EmailMessage()
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception:
        logger.exception("Failed to send email to %s with subject %r", to_email, subject)
        return False

    return True
