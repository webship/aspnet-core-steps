using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.WebUtilities;

namespace __APP__.Pages;

// The status code page of the app (app.UseStatusCodePagesWithReExecute("/StatusCode", "?code={0}")): what an answer
// without a body of its own shows, a 404 or a 400, with the status kept.
[ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
[IgnoreAntiforgeryToken]
public class StatusCodeModel : PageModel
{
    public int OriginalStatusCode { get; set; }

    public string ReasonPhrase => ReasonPhrases.GetReasonPhrase(OriginalStatusCode);

    public string? OriginalPathAndQuery { get; set; }

    public void OnGet(int code) => Load(code);

    // A form that was refused (a 400 for a missing anti-forgery token) is shown again with its own method.
    public void OnPost(int code) => Load(code);

    private void Load(int code)
    {
        OriginalStatusCode = code;
        var feature = HttpContext.Features.Get<IStatusCodeReExecuteFeature>();
        if (feature is not null)
        {
            OriginalPathAndQuery = $"{feature.OriginalPathBase}{feature.OriginalPath}{feature.OriginalQueryString}";
        }
    }
}
