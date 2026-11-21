using Microsoft.AspNetCore.Mvc.RazorPages;

namespace __APP__.Pages;

// A fixture of the test site, its only page that is not a page of a real app: it throws, so the app's error page
// (in production) and the developer exception page (in development) can be seen.
public class ThrowModel : PageModel
{
    public void OnGet() => throw new InvalidOperationException("A test exception, thrown by the /Throw page of the test site.");
}
