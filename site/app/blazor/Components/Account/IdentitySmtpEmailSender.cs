using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI.Services;
using __APP__.Data;

namespace __APP__.Components.Account;

// The mail of the account pages, with the words of the template's IdentityNoOpEmailSender, sent over SMTP to the
// project's mail catcher. Added by the build of the test site in place of the no-op sender.
internal sealed class IdentitySmtpEmailSender(IEmailSender emailSender) : IEmailSender<ApplicationUser>
{
    public Task SendConfirmationLinkAsync(ApplicationUser user, string email, string confirmationLink) =>
        emailSender.SendEmailAsync(email, "Confirm your email", $"Please confirm your account by <a href='{confirmationLink}'>clicking here</a>. If you didn't request this email confirmation, you can ignore this email.");

    public Task SendPasswordResetLinkAsync(ApplicationUser user, string email, string resetLink) =>
        emailSender.SendEmailAsync(email, "Reset your password", $"Please reset your password by <a href='{resetLink}'>clicking here</a>. If you didn't request a password reset, you can ignore this email.");

    public Task SendPasswordResetCodeAsync(ApplicationUser user, string email, string resetCode) =>
        emailSender.SendEmailAsync(email, "Reset your password", $"Please reset your password using the following code: {resetCode}. If you didn't request a password reset, you can ignore this email.");
}
