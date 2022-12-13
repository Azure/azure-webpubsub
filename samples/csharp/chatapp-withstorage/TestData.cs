using Microsoft.Azure.WebPubSub.Samples;

public class TestData
{
    public static async Task LoadTestData(IChatHandler chatHandler)
    {
        var users = Enumerable.Range(0, 10).Select(i => "user" + i).ToArray();
        var count = users.Length;
        var rand = new Random();
        var words = new string[]
        {
        "Hello", "See you", "Nice", "Awesome", "How are you", "Great", "Hm....", "Haha", "Apple", "Orange"
        };
        // Generate random chat messages
        for (var i = 0; i < 100; i++)
        {
            var from = users[rand.Next(count)];
            var to = users[rand.Next(count)];
            var text = string.Join(' ', new string[] {
            words[rand.Next(words.Length)],
            words[rand.Next(words.Length)],
            words[rand.Next(words.Length)]});
            await chatHandler.AddMessageAsync(from, to, text);
        }
    }
}
