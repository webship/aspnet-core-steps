using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using __APP__.Data;
using __APP__.Models;

namespace __APP__.Pages.Movies;

[Authorize]
public class CreateModel(ApplicationDbContext context) : PageModel
{
    public IActionResult OnGet()
    {
        return Page();
    }

    [BindProperty]
    public Movie Movie { get; set; } = default!;

    public async Task<IActionResult> OnPostAsync()
    {
        if (!ModelState.IsValid)
        {
            return Page();
        }

        context.Movie.Add(Movie);
        await context.SaveChangesAsync();

        return RedirectToPage("./Index");
    }
}
