using Microsoft.EntityFrameworkCore;
using __APP__.Models;

namespace __APP__.Data;

// The sample movies of the official Razor Pages tutorial, added once, when the table is empty.
public static class MovieSeeder
{
    public static async Task RunAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        if (await context.Movie.AnyAsync()) return;
        context.Movie.AddRange(
            new Movie { Title = "When Harry Met Sally", ReleaseDate = DateTime.Parse("1989-2-12"), Genre = "Romantic Comedy", Price = 7.99M, Rating = "R" },
            new Movie { Title = "Ghostbusters", ReleaseDate = DateTime.Parse("1984-3-13"), Genre = "Comedy", Price = 8.99M, Rating = "G" },
            new Movie { Title = "Ghostbusters 2", ReleaseDate = DateTime.Parse("1986-2-23"), Genre = "Comedy", Price = 9.99M, Rating = "G" },
            new Movie { Title = "Rio Bravo", ReleaseDate = DateTime.Parse("1959-4-15"), Genre = "Western", Price = 3.99M, Rating = "NR" });
        await context.SaveChangesAsync();
        Console.WriteLine("The sample movies are in.");
    }
}
