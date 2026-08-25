// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

/// <summary>
/// Minimal await-with-timeout helpers so a hung emulator surfaces as a test
/// failure with the caller location instead of a stuck test run.
/// </summary>
internal static class TaskExtensions
{
    private const int DefaultTimeoutMilliseconds = 30_000;

    internal static Task OrTimeout(
        this Task task,
        int milliseconds = DefaultTimeoutMilliseconds,
        [CallerMemberName] string? memberName = null,
        [CallerFilePath] string? filePath = null,
        [CallerLineNumber] int lineNumber = 0)
    {
        return OrTimeout(task, TimeSpan.FromMilliseconds(milliseconds), memberName, filePath, lineNumber);
    }

    internal static async Task OrTimeout(
        this Task task,
        TimeSpan timeout,
        [CallerMemberName] string? memberName = null,
        [CallerFilePath] string? filePath = null,
        [CallerLineNumber] int lineNumber = 0)
    {
        if (task.IsCompleted)
        {
            await task;
            return;
        }

        using var cancellation = new CancellationTokenSource();
        var delay = Task.Delay(GetEffectiveTimeout(timeout), cancellation.Token);
        var completed = await Task.WhenAny(task, delay);
        if (completed != task)
        {
            throw new TimeoutException(FormatMessage(memberName, filePath, lineNumber));
        }

        cancellation.Cancel();
        await task;
    }

    internal static Task<T> OrTimeout<T>(
        this Task<T> task,
        int milliseconds = DefaultTimeoutMilliseconds,
        [CallerMemberName] string? memberName = null,
        [CallerFilePath] string? filePath = null,
        [CallerLineNumber] int lineNumber = 0)
    {
        return OrTimeout(task, TimeSpan.FromMilliseconds(milliseconds), memberName, filePath, lineNumber);
    }

    internal static async Task<T> OrTimeout<T>(
        this Task<T> task,
        TimeSpan timeout,
        [CallerMemberName] string? memberName = null,
        [CallerFilePath] string? filePath = null,
        [CallerLineNumber] int lineNumber = 0)
    {
        if (task.IsCompleted)
        {
            return await task;
        }

        using var cancellation = new CancellationTokenSource();
        var delay = Task.Delay(GetEffectiveTimeout(timeout), cancellation.Token);
        var completed = await Task.WhenAny(task, delay);
        if (completed != task)
        {
            throw new TimeoutException(FormatMessage(memberName, filePath, lineNumber));
        }

        cancellation.Cancel();
        return await task;
    }

    internal static ValueTask<T> OrTimeout<T>(
        this ValueTask<T> task,
        int milliseconds = DefaultTimeoutMilliseconds,
        [CallerMemberName] string? memberName = null,
        [CallerFilePath] string? filePath = null,
        [CallerLineNumber] int lineNumber = 0)
    {
        return task.IsCompleted
            ? task
            : new ValueTask<T>(OrTimeout(task.AsTask(), milliseconds, memberName, filePath, lineNumber));
    }

    private static TimeSpan GetEffectiveTimeout(TimeSpan timeout)
    {
        return Debugger.IsAttached ? Timeout.InfiniteTimeSpan : timeout;
    }

    private static string FormatMessage(string? memberName, string? filePath, int lineNumber)
    {
        return string.IsNullOrEmpty(memberName)
            ? "Operation timed out."
            : $"Operation in {memberName} timed out at {filePath}:{lineNumber}.";
    }
}
