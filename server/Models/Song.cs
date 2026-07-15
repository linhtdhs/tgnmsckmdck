namespace TgnmsckmdckApi.Models;

public class Song
{
    public int Id { get; set; }
    public string YoutubeId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Filename { get; set; } = "";
    public int Duration { get; set; }
    public string? Thumbnail { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<Tag> Tags { get; set; } = [];
}
