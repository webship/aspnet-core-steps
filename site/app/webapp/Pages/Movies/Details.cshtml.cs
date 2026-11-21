using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using __APP__.Data;
using __APP__.Models;

namespace __APP__.Pages.Movies;

[Authorize]
public class DetailsModel(ApplicationDbContext context) : PageModel
{
    public Movie Movie { get; set; } = default!;

    public async Task<IActionResult> OnGetAsync(int? id)
    {
        if (id == null)
        {
            return NotFound();
        }

        var movie = await context.Movie.FirstOrDefaultAsync(m => m.Id == id);
        if (movie is not null)
        {
            Movie = movie;
            return Page();
        }

        return NotFound();
    }
}
