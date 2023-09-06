
using System.Buffers;

public static class BufferWriterExtensions
{
    public static PrefixedLengthBufferWriter WithLengthPrefix(
        this IBufferWriter<byte> writer) => new(writer);
}

public sealed class PrefixedLengthBufferWriter : IBufferWriter<byte>, IDisposable
{
    private readonly IBufferWriter<byte> _inner;
    private readonly Memory<byte> _memory;

    public PrefixedLengthBufferWriter(IBufferWriter<byte> writer)
    {
        _inner = writer;
        _memory = writer.GetMemory(4);
        writer.Advance(4);
    }

    public int InnerLength { get; private set; }

    public int OuterLength => InnerLength + 4;

    #region IBufferWriter

    public void Advance(int count)
    {
        _inner.Advance(count);
        InnerLength += count;
    }

    public Memory<byte> GetMemory(int sizeHint = 0) => _inner.GetMemory(sizeHint);

    public Span<byte> GetSpan(int sizeHint = 0) => _inner.GetSpan(sizeHint);

    #endregion

    #region IDisposable

    public void Dispose()
    {
        BitConverter.TryWriteBytes(_memory.Span, InnerLength);
    }

    #endregion
}