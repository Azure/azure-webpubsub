using System;
using System.Buffers;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

public static class ReadOnlyMemoryExtensions
{
    public static ArraySegment<T> GetArraySegment<T>(this ReadOnlyMemory<T> input)
    {
        var isArray = MemoryMarshal.TryGetArray(input, out var arraySegment);
        // This will never be false unless we started using un-managed buffers
        Debug.Assert(isArray);
        return arraySegment;
    }

    public static IMemoryOwner<T> ToMemoryOwner<T>(this ReadOnlyMemory<T> memory) =>
        MemoryMarshal.AsMemory(memory).ToMemoryOwner();

    public static IMemoryOwner<byte> CopyValueToMemoryOwner(this Utf8JsonReader dataToken)
    {
        if (dataToken.HasValueSequence)
        {
            var sequence = dataToken.ValueSequence;
            return sequence.CopyToMemoryOwner();
        }
        else
        {
            var span = dataToken.ValueSpan;
            var owner = ExactSizeMemoryPool.Shared.Rent(span.Length);
            span.CopyTo(owner.Memory.Span);
            return owner;
        }
    }
}