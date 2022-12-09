﻿using Microsoft.Azure.WebPubSub.Samples;

public class TestData
{
    public static async Task LoadTestData(IUserManager userManager, IChatHandler chatHandler)
    {
        for (var i = 0; i < 10; i++)
        {
            await userManager.AddUserAsync("User" + i);
        }

        var users = await userManager.GetUsersAsync();
        var count = users.Count;
        var rand = new Random();
        var words = new string[]
        {
        "Hello", "See you", "Nice", "Awesome", "How are you", "Great", "Hm....", "Haha", "Apple", "Orange"
        };
        // Generate random chat messages
        for (var i = 0; i < 100; i++)
        {
            var from = users[rand.Next(count)].name;
            var to = users[rand.Next(count)].name;
            var text = string.Join(' ', new string[] {
            words[rand.Next(words.Length)],
            words[rand.Next(words.Length)],
            words[rand.Next(words.Length)]});
            chatHandler.AddMessageAsync(from, to, text);
        }
    }
}
