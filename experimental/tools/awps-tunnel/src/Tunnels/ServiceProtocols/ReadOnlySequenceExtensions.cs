using System;
using System.Buffers;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

public static class ReadOnlySequenceExtensions
{
    public static ArraySegment<byte> GetArraySegment(this ReadOnlySequence<byte> input)
    {
        if (input.IsSingleSegment)
        {
            var isArray = MemoryMarshal.TryGetArray(input.First, out var arraySegment);
            // This will never be false unless we started using un-managed buffers
            Debug.Assert(isArray);
            return arraySegment;
        }

        // Should be rare
        return new ArraySegment<byte>(input.ToArray());
    }

    public static IMemoryOwner<byte> CopyToMemoryOwner(this ReadOnlySequence<byte> input)
    {
        var owner = ExactSizeMemoryPool.Shared.Rent((int)input.Length);
        input.CopyTo(owner.Memory.Span);
        return owner;
    }

    public static Stream AsStream(this ReadOnlySequence<byte> input) => new ReadOnlySequenceStream(input);

    private sealed class ReadOnlySequenceStream : Stream
    {
        private readonly ReadOnlySequence<byte> _sequence;
        private SequencePosition _position;

        public ReadOnlySequenceStream(ReadOnlySequence<byte> sequence)
        {
            _sequence = sequence;
            _position = _sequence.Start;
        }

        public override void Flush()
        {
            throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            var remain = _sequence.Slice(_position);
            var result = remain.Slice(0, Math.Min(count, remain.Length));
            _position = result.End;
            result.CopyTo(buffer.AsSpan(offset, count));
            return (int)result.Length;
        }

        public override long Seek(long offset, SeekOrigin origin)
        {
            switch (origin)
            {
                case SeekOrigin.Begin:
                    _position = _sequence.GetPosition(offset);
                    break;
                case SeekOrigin.End:
                    if (offset >= 0)
                    {
                        _position = _sequence.GetPosition(offset, _sequence.End);
                    }
                    if (offset < 0)
                    {
                        _position = _sequence.GetPosition(offset + _sequence.Length);
                    }
                    break;
                case SeekOrigin.Current:
                    if (offset >= 0)
                    {
                        _position = _sequence.GetPosition(offset, _position);
                    }
                    else
                    {
                        _position = _sequence.GetPosition(offset + Position);
                    }
                    break;
                default:
                    throw new ArgumentOutOfRangeException();
            }

            return Position;
        }

        public override void SetLength(long value)
        {
            throw new NotSupportedException();
        }

        public override void Write(byte[] buffer, int offset, int count)
        {
            throw new NotSupportedException();
        }

        public override bool CanRead => true;

        public override bool CanSeek => true;

        public override bool CanWrite => false;

        public override long Length => _sequence.Length;

        public override long Position
        {
            get => _sequence.Slice(0, _position).Length;
            set
            {
                if (value < 0)
                {
                    throw new ArgumentOutOfRangeException();
                }
                _position = _sequence.GetPosition(value);
            }
        }
    }
}