using System.Net.Mail;
using Microsoft.AspNetCore.Identity.UI.Services;

namespace __APP__.Services;

/// <summary>
/// The app's mail, sent over SMTP. Added by the build of the test site and pointed at the project's mail catcher
/// (Smtp:Host and Smtp:Port, 127.0.0.1:1025 by default): the confirmation mail of an account, the password reset,
/// the confirmation of a new email address.
/// </summary>
public sealed class SmtpEmailSender(IConfiguration configuration, ILogger<SmtpEmailSender> logger) : IEmailSender
{
    public async Task SendEmailAsync(string email, string subject, string htmlMessage)
    {
        var host = configuration["Smtp:Host"] ?? "127.0.0.1";
        var port = int.TryParse(configuration["Smtp:Port"], out var p) ? p : 1025;
        var from = configuration["Smtp:From"] ?? "noreply@example.com";
        using var client = new SmtpClient(host, port) { EnableSsl = false, DeliveryMethod = SmtpDeliveryMethod.Network };
        using var message = new MailMessage(from, email, subject, htmlMessage) { IsBodyHtml = true };
        await client.SendMailAsync(message);
        logger.LogInformation("Sent \"{Subject}\" to {Email} through {Host}:{Port}.", subject, email, host, port);
    }
}
