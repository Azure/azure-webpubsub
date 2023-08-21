using System;
using System.Buffers;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

public static class BufferWriterExtensions
{
    public static Stream AsStream(this IBufferWriter<byte> writer) =>
        new StreamWrapper(writer ?? throw new ArgumentNullException(nameof(writer)));

    private sealed class StreamWrapper : Stream
    {
        private const int BufferSize = 4096;

        private readonly IBufferWriter<byte> _writer;

        private int _length;

        public StreamWrapper(IBufferWriter<byte> writer) =>
            _writer = writer;

        public override bool CanRead => false;

        public override bool CanSeek => false;

        public override bool CanWrite => true;

        public override long Length => _length;

        public override long Position
        {
            get => _length;
            set => throw new NotSupportedException();
        }

        public override void Flush()
        {
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            throw new NotSupportedException();
        }

        public override long Seek(long offset, SeekOrigin origin) =>
            throw new NotSupportedException();

        public override void SetLength(long value) =>
            throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) =>
            Write(buffer.AsSpan()[offset..(offset + count)]);

        public override void Write(ReadOnlySpan<byte> buffer)
        {
            if (buffer.Length <= BufferSize)
            {
                var m = _writer.GetMemory(buffer.Length);
                buffer.CopyTo(m.Span);
                _writer.Advance(buffer.Length);
            }
            else
            {
                var input = buffer;
                while (!input.IsEmpty)
                {
                    var m = _writer.GetMemory(BufferSize);
                    var c = Math.Min(input.Length, BufferSize);
                    input[..c].CopyTo(m.Span);
                    _writer.Advance(c);
                    input = input[c..];
                }
            }
            _length += buffer.Length;
        }

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            Write(buffer.Span);
            return default;
        }

        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            Write(buffer.AsSpan()[offset..(offset + count)]);
            _length += count;
            return Task.CompletedTask;
        }

        public override void WriteByte(byte value)
        {
            var m = _writer.GetMemory(1);
            m.Span[0] = value;
            _writer.Advance(1);
            _length++;
        }
    }
}