using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace __APP__.Data;

/// <summary>
/// The accounts of the test app, made the way an app makes them: through its own user manager and role manager.
/// Added by the build of the test site, and run by it with the app itself:
///   dotnet __APP__.dll --seed-accounts accounts.json     (the password on standard input, never on a command line)
///   dotnet __APP__.dll --cancel-accounts accounts.json
/// Seeding applies the migrations first, then makes each account of the file exist in the state the file gives it
/// (its password, its roles, a confirmed or unconfirmed email, two-factor sign-in with a known authenticator key,
/// a lockout), and puts back what a test may have changed (a phone number, two-factor set up by hand, recovery
/// codes, failed logins). Cancelling deletes the accounts of the file; every other account stays.
/// </summary>
public static class AccountSeeder
{
    // Where the user store keeps the authenticator key and the recovery codes of an account.
    private const string StoreProvider = "[AspNetUserStore]";

    public sealed class AccountFile
    {
        public List<string> Roles { get; set; } = new();
        public List<Account> Accounts { get; set; } = new();
    }

    public sealed class Account
    {
        public string Email { get; set; } = string.Empty;
        public List<string> Roles { get; set; } = new();
        public bool EmailConfirmed { get; set; } = true;
        public string? AuthenticatorKey { get; set; }
        public bool LockedOut { get; set; }
    }

    public static async Task<int> RunAsync<TUser>(IServiceProvider services, string[] args) where TUser : IdentityUser, new()
    {
        var seed = Array.IndexOf(args, "--seed-accounts");
        var cancel = Array.IndexOf(args, "--cancel-accounts");
        var at = seed >= 0 ? seed : cancel;
        if (at < 0 || at + 1 >= args.Length)
        {
            Console.Error.WriteLine("Usage: --seed-accounts <accounts.json> (the password on standard input) | --cancel-accounts <accounts.json>");
            return 2;
        }
        var spec = JsonSerializer.Deserialize<AccountFile>(await File.ReadAllTextAsync(args[at + 1]), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new AccountFile();

        using var scope = services.CreateScope();
        var provider = scope.ServiceProvider;
        await provider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
        var users = provider.GetRequiredService<UserManager<TUser>>();

        if (cancel >= 0)
        {
            foreach (var account in spec.Accounts)
            {
                var found = await users.FindByEmailAsync(account.Email) ?? await users.FindByNameAsync(account.Email);
                if (found is null) continue;
                Check(await users.DeleteAsync(found), $"delete {account.Email}");
                Console.WriteLine($"Deleted {account.Email}.");
            }
            return 0;
        }

        var password = (await Console.In.ReadToEndAsync()).TrimEnd('\r', '\n');
        if (password.Length == 0 && spec.Accounts.Count > 0)
        {
            Console.Error.WriteLine("No password on standard input.");
            return 2;
        }

        var roles = provider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in spec.Roles.Concat(spec.Accounts.SelectMany(a => a.Roles)).Distinct())
        {
            if (!await roles.RoleExistsAsync(role)) Check(await roles.CreateAsync(new IdentityRole(role)), $"create the role {role}");
        }

        foreach (var account in spec.Accounts)
        {
            var user = await users.FindByEmailAsync(account.Email) ?? await users.FindByNameAsync(account.Email);
            if (user is null)
            {
                user = new TUser { UserName = account.Email, Email = account.Email };
                Check(await users.CreateAsync(user, password), $"create {account.Email}");
            }
            else
            {
                if (await users.HasPasswordAsync(user)) Check(await users.RemovePasswordAsync(user), $"remove the password of {account.Email}");
                Check(await users.AddPasswordAsync(user, password), $"set the password of {account.Email}");
            }

            user.UserName = account.Email;
            user.Email = account.Email;
            user.EmailConfirmed = account.EmailConfirmed;
            user.PhoneNumber = null;
            user.PhoneNumberConfirmed = false;
            user.TwoFactorEnabled = !string.IsNullOrWhiteSpace(account.AuthenticatorKey);
            user.LockoutEnabled = true;
            user.LockoutEnd = account.LockedOut ? DateTimeOffset.UtcNow.AddYears(100) : null;
            user.AccessFailedCount = 0;
            Check(await users.UpdateAsync(user), $"update {account.Email}");

            // Two-factor sign-in: the authenticator key a test works its codes out from, or none; no recovery codes.
            await users.RemoveAuthenticationTokenAsync(user, StoreProvider, "RecoveryCodes");
            if (string.IsNullOrWhiteSpace(account.AuthenticatorKey))
            {
                await users.RemoveAuthenticationTokenAsync(user, StoreProvider, "AuthenticatorKey");
            }
            else
            {
                Check(await users.SetAuthenticationTokenAsync(user, StoreProvider, "AuthenticatorKey", account.AuthenticatorKey.Replace(" ", string.Empty).ToUpperInvariant()), $"set the authenticator key of {account.Email}");
            }

            var current = await users.GetRolesAsync(user);
            var extra = current.Except(account.Roles).ToList();
            var missing = account.Roles.Except(current).ToList();
            if (extra.Count > 0) Check(await users.RemoveFromRolesAsync(user, extra), $"remove the roles of {account.Email}");
            if (missing.Count > 0) Check(await users.AddToRolesAsync(user, missing), $"add the roles of {account.Email}");

            var state = new List<string>();
            if (account.Roles.Count > 0) state.Add(string.Join(", ", account.Roles));
            if (!account.EmailConfirmed) state.Add("email not confirmed");
            if (user.TwoFactorEnabled) state.Add("two-factor sign-in");
            if (account.LockedOut) state.Add("locked out");
            Console.WriteLine($"{account.Email}{(state.Count > 0 ? $" ({string.Join("; ", state)})" : string.Empty)}");
        }
        return 0;
    }

    private static void Check(IdentityResult result, string what)
    {
        if (!result.Succeeded)
        {
            throw new InvalidOperationException($"Could not {what}: {string.Join(" ", result.Errors.Select(e => e.Description))}");
        }
    }
}
