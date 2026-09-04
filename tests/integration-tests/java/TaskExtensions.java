import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class TaskExtensions {
    public static <T> CompletableFuture<T> orTimeout(CompletableFuture<T> future, int millisecondsDelay) {
        CompletableFuture<T> timeoutFuture = new CompletableFuture<>();
        CompletableFuture.delayedExecutor(millisecondsDelay, TimeUnit.MILLISECONDS).execute(() -> timeoutFuture.completeExceptionally(new TimeoutException()));
        return future.applyToEither(timeoutFuture, result -> result);
    }
}
