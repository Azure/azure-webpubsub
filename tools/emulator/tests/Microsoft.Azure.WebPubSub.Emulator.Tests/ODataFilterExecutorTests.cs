// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class ODataFilterExecutorTests
{
    [Theory]
    [InlineData("userId eq 'a'", "a", true)]
    [InlineData("userId eq 'a'", "A", false)]
    [InlineData("userId eq null", null, true)]
    [InlineData("userId in ('user1', 'user2')", "user2", true)]
    [InlineData("userId in ('Doe, John', 'Alice')", "Doe, John", true)]
    [InlineData("userId in ('O''Brien, Jane', 'Alice')", "O'Brien, Jane", true)]
    [InlineData("substring(userId, 1, 1) eq 'b'", "abc", true)]
    [InlineData("substring(userId, 1) eq 'b'", "", false)]
    [InlineData("substring(userId, 1, 2) eq 'bc'", "a", false)]
    [InlineData("contains(userId, 'b')", "aaa", false)]
    public void MatchesUserFilter(string filter, string? userId, bool expected)
    {
        var model = new TestModel { UserId = userId };

        Assert.Equal(expected, ODataFilterExecutor.Instance.Matches(filter, model));
    }

    [Fact]
    public void MatchesConnectionGroupAndProtocolFilter()
    {
        var model = new TestModel
        {
            ConnectionId = "connection-1",
            Groups = ["group1", "group2"],
            Protocol = "json.webpubsub.azure.v1",
        };

        Assert.True(ODataFilterExecutor.Instance.Matches(
            "connectionId eq 'connection-1' and 'group2' in groups and " +
            "protocol eq 'json.webpubsub.azure.v1'",
            model));
    }

    [Theory]
    [InlineData(
        "( not 'a' )",
        "Invalid syntax for 'not 'a'': Type 'string', expect 'bool'. (Parameter 'filter')")]
    [InlineData(
        "userId lt 1",
        "Invalid syntax for 'userId lt 1': Type 'string', expect 'int'. (Parameter 'filter')")]
    [InlineData(
        "invalid(ab,c)",
        "Invalid syntax for 'invalid(ab,c)': Token 'invalid(ab,c)' is not supported. (Parameter 'filter')")]
    [InlineData(
        "ab eq 1",
        "Invalid syntax for 'ab eq 1': Token 'ab' is not supported. (Parameter 'filter')")]
    public void ValidateInvalidFilterMatchesRuntimeError(string filter, string expectedError)
    {
        var exception = Assert.Throws<InvalidFilterException>(() =>
            ODataFilterExecutor.Instance.Validate(filter));

        Assert.Equal(expectedError, exception.Message);
    }

    [Fact]
    public void ValidateSubstring_DoesNotDependOnValidationModelLength()
    {
        ODataFilterExecutor.Instance.Validate("substring(connectionId, 1) eq 'onnection-1'");
    }

    private sealed class TestModel : IODataFilterModel
    {
        public string ConnectionId { get; init; } = string.Empty;

        public string? UserId { get; init; }

        public string[] Groups { get; init; } = [];

        public string? Protocol { get; init; }
    }
}