using System;
using System.Buffers;

public static class MemoryExtensions
{
    public static ArraySegment<T> GetArraySegment<T>(this Memory<T> input) =>
        ((ReadOnlyMemory<T>)input).GetArraySegment();

    public static IMemoryOwner<T> ToMemoryOwner<T>(this T[] input) => new MemoryOwnerAdaptor<T>(input);

    public static IMemoryOwner<T> ToMemoryOwner<T>(this Memory<T> input) => new MemoryOwnerAdaptor<T>(input);

    public static IMemoryOwner<T> ToMemoryOwner<T>(this ArraySegment<T> input) => new MemoryOwnerAdaptor<T>(input);

    private sealed class MemoryOwnerAdaptor<T> : IMemoryOwner<T>
    {
        public Memory<T> Memory { get; }

        public MemoryOwnerAdaptor(Memory<T> memory)
        {
            Memory = memory;
        }

        public void Dispose()
        {
        }
    }
}