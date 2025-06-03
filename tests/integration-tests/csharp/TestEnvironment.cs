
using dotenv.net;

namespace csharp
{
    [SetUpFixture]
    public class TestEnvironment
    {
        public static string ConnectionString { get; private set; }

        [OneTimeSetUp]
        public void GlobalSetup()
        {
            // TODO: provision the resources?
            // What if multiple different resources needed?
            DotEnv.Load();

            ConnectionString = Environment.GetEnvironmentVariable("WEB_PUBSUB_CONNECTION_STRING") ?? throw new InvalidOperationException("Please set the WEB_PUBSUB_CONNECTION_STRING environment variable.");
        }

        [OneTimeTearDown]
        public void GlobalTeardown()
        {
            // Clean up any resources if necessary
        }
    }
}