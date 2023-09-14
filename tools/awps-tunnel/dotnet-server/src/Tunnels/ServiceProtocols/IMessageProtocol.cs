using System.Buffers;

public interface IMessageProtocol<T>
{
    bool TryParse(ref ReadOnlySequence<byte> buffer, out T? message);
    void Write(T message, IBufferWriter<byte> writer);
}
