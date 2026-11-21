using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace __APP__.Pages.Admin;

// A page only the Administrator role may open: the accounts of the app, read only.
[Authorize(Roles = "Administrator")]
public class IndexModel(UserManager<IdentityUser> userManager) : PageModel
{
    public record AccountRow(string Email, string Roles, bool EmailConfirmed, bool TwoFactorEnabled, bool LockedOut);

    public IList<AccountRow> Accounts { get; set; } = new List<AccountRow>();

    public async Task OnGetAsync()
    {
        var rows = new List<AccountRow>();
        foreach (var user in await userManager.Users.OrderBy(u => u.Email).ToListAsync())
        {
            var roles = string.Join(", ", await userManager.GetRolesAsync(user));
            var locked = user.LockoutEnd.HasValue && user.LockoutEnd.Value > DateTimeOffset.UtcNow;
            rows.Add(new AccountRow(user.Email ?? user.UserName ?? string.Empty, roles, user.EmailConfirmed, user.TwoFactorEnabled, locked));
        }
        Accounts = rows;
    }
}
