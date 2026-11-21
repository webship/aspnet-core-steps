using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using __APP__.Data;
using __APP__.Models;

namespace __APP__.Pages.Movies;

[Authorize]
public class IndexModel(ApplicationDbContext context) : PageModel
{
    public IList<Movie> Movie { get; set; } = default!;

    [BindProperty(SupportsGet = true)]
    public string? SearchString { get; set; }

    public SelectList? Genres { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? MovieGenre { get; set; }

    public async Task OnGetAsync()
    {
        IQueryable<string> genreQuery = from m in context.Movie orderby m.Genre select m.Genre;
        var movies = from m in context.Movie select m;
        if (!string.IsNullOrEmpty(SearchString))
        {
            movies = movies.Where(s => s.Title.Contains(SearchString));
        }
        if (!string.IsNullOrEmpty(MovieGenre))
        {
            movies = movies.Where(x => x.Genre == MovieGenre);
        }
        Genres = new SelectList(await genreQuery.Distinct().ToListAsync());
        Movie = await movies.ToListAsync();
    }
}
