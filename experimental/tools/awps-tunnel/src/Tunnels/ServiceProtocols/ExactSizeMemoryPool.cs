using System;
using System.Buffers;

#nullable disable
public class ExactSizeMemoryPool : MemoryPool<byte>
{
    public static new ExactSizeMemoryPool Shared { get; } = new ExactSizeMemoryPool();

    private static IMemoryOwner<byte> Empty { get; } = new EmptyMemoryOwner();

    public static IMemoryOwner<byte> Resize(IMemoryOwner<byte> owner, int offset, int size)
    {
        if (size < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(size));
        }
        if (offset < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(offset));
        }
        if (offset > owner.Memory.Length)
        {
            throw new ArgumentOutOfRangeException(nameof(offset));
        }
        if (offset + size > owner.Memory.Length)
        {
            throw new ArgumentOutOfRangeException(nameof(size));
        }
        if (size == 0)
        {
            return Empty;
        }
        return new ResizeMemoryOwner(owner, offset, size);
    }

    public override int MaxBufferSize => int.MaxValue;

    public override IMemoryOwner<byte> Rent(int size)
    {
        if (size < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(size));
        }
        if (size == 0)
        {
            return Empty;
        }
        return new ExactSizeMemoryOwner(size);
    }

    protected override void Dispose(bool disposing)
    {
    }

    private sealed class ExactSizeMemoryOwner : IMemoryOwner<byte>
    {
        private readonly int _size;
        private byte[] _array;

        public ExactSizeMemoryOwner(int size)
        {
            _size = size;
            _array = ArrayPool<byte>.Shared.Rent(size);
        }

        public Memory<byte> Memory
        {
            get
            {
                var array = _array;
                if (array == null)
                {
                    throw new ObjectDisposedException(nameof(ExactSizeMemoryOwner));
                }
                return new Memory<byte>(array, 0, _size);
            }
        }

        public void Dispose()
        {
            var array = _array;
            if (array != null)
            {
                _array = null;
                ArrayPool<byte>.Shared.Return(array);
            }
        }
    }

    private sealed class EmptyMemoryOwner : IMemoryOwner<byte>
    {
        public Memory<byte> Memory => Array.Empty<byte>();

        public void Dispose() { }
    }

    private sealed class ResizeMemoryOwner : IMemoryOwner<byte>
    {
        private readonly IMemoryOwner<byte> _underlying;
        private readonly int _offset;
        private readonly int _size;

        public ResizeMemoryOwner(IMemoryOwner<byte> underlying, int offset, int size)
        {
            _underlying = underlying;
            _offset = offset;
            _size = size;
        }

        public Memory<byte> Memory => _underlying.Memory.Slice(_offset, _size);

        public void Dispose() => _underlying.Dispose();
    }
}
