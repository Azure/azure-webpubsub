using System;
using System.Collections.Generic;
using System.IO;

using MessagePack;
#nullable disable

public static class MessagePackWriter
{
    public static MessagePackWriter<MessagePackTerminator<TStream>> Create<TStream>(
        TStream stream)
        where TStream : Stream =>
        new(stream, new(stream));
}

public struct MessagePackWriter<TOuter>
{
    private readonly TOuter _outer;
    private readonly Stream _stream;

    public MessagePackWriter(Stream stream, TOuter outer)
    {
        _stream = stream;
        _outer = outer;
    }

    public TOuter Text(string text)
    {
        MessagePackBinary.WriteString(_stream, text);
        return _outer;
    }

    public TOuter Int(int value)
    {
        MessagePackBinary.WriteInt32(_stream, value);
        return _outer;
    }

    public TOuter Nil()
    {
        MessagePackBinary.WriteNil(_stream);
        return _outer;
    }

    public MessagePackValueWriter<TOuter> Simple() =>
        new(_stream, _outer);

    public MessagePackArrayWriter<TOuter> Array(int count)
    {
        MessagePackBinary.WriteArrayHeader(_stream, count);
        return new(_stream, _outer, count);
    }

    public TOuter StringArray(IReadOnlyCollection<string> array)
    {
        MessagePackHelper.WriteStringArray(_stream, array);
        return _outer;
    }

    public TOuter NullableStringArray(IReadOnlyCollection<string> array)
    {
        MessagePackHelper.WriteNullableStringArray(_stream, array);
        return _outer;
    }

    public TOuter EmptyArray()
    {
        MessagePackBinary.WriteArrayHeader(_stream, 0);
        return _outer;
    }

    public TOuter Array<TValue>(
        IReadOnlyCollection<TValue> array,
        Func<MessagePackWriter<MessagePackTerminator<Stream>>, TValue, MessagePackTerminator<Stream>> func)
    {
        if (array.Count == 0)
        {
            return EmptyArray();
        }
        MessagePackBinary.WriteArrayHeader(_stream, array.Count);
        foreach (var item in array)
        {
            _ = func(new(_stream, new(_stream)), item);
        }
        return _outer;
    }

    public MessagePackMapWriter<TOuter> Map(int count)
    {
        MessagePackBinary.WriteMapHeader(_stream, count);
        return new(_stream, _outer, count);
    }

    public TOuter Map<TValue>(
        IReadOnlyDictionary<string, TValue> dict,
        Func<MessagePackWriter<MessagePackTerminator<Stream>>, TValue, MessagePackTerminator<Stream>> func)
    {
        if (dict?.Count == 0)
        {
            return EmptyMap();
        }
        MessagePackBinary.WriteMapHeader(_stream, dict.Count);
        foreach (var (k, v) in dict)
        {
            MessagePackBinary.WriteString(_stream, k);
            _ = func(new(_stream, new(_stream)), v);
        }
        return _outer;
    }

    public TOuter StringMap(IReadOnlyDictionary<string, string> dict)
    {
        if (dict.Count == 0)
        {
            return EmptyMap();
        }
        MessagePackBinary.WriteMapHeader(_stream, dict.Count);
        foreach (var (k, v) in dict)
        {
            MessagePackBinary.WriteString(_stream, k);
            MessagePackBinary.WriteString(_stream, v);
        }
        return _outer;
    }

    public TOuter StringMap(IDictionary<string, string> dict)
    {
        if (dict.Count == 0)
        {
            return EmptyMap();
        }
        MessagePackBinary.WriteMapHeader(_stream, dict.Count);
        foreach (var (k, v) in dict)
        {
            MessagePackBinary.WriteString(_stream, k);
            MessagePackBinary.WriteString(_stream, v);
        }
        return _outer;
    }

    public TOuter PayloadsMap(IDictionary<string, ReadOnlyMemory<byte>> payloads)
    {
        if (payloads?.Count > 0)
        {
            MessagePackBinary.WriteMapHeader(_stream, payloads.Count);
            foreach (var (k, v) in payloads)
            {
                MessagePackBinary.WriteString(_stream, k);
                var segment = v.GetArraySegment();
                MessagePackBinary.WriteBytes(_stream, segment.Array, segment.Offset, segment.Count);
            }
            return _outer;
        }
        return EmptyMap();
    }

    public TOuter EmptyMap()
    {
        MessagePackBinary.WriteMapHeader(_stream, 0);
        return _outer;
    }
}

public struct MessagePackTerminator<TStream>
    where TStream : Stream
{
    private readonly TStream _stream;
    public MessagePackTerminator(TStream stream) => _stream = stream;
    public TStream Terminate() => _stream;
}

public struct MessagePackValueWriter<TOuter>
{
    private readonly Stream _stream;
    private readonly TOuter _outer;

    internal MessagePackValueWriter(Stream stream, TOuter outer)
    {
        _stream = stream;
        _outer = outer;
    }

    public TOuter Value(string text)
    {
        MessagePackBinary.WriteString(_stream, text);
        return _outer;
    }

    public TOuter Value(char value)
    {
        MessagePackBinary.WriteChar(_stream, value);
        return _outer;
    }

    public TOuter Value(char? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteChar(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(sbyte value)
    {
        MessagePackBinary.WriteSByte(_stream, value);
        return _outer;
    }

    public TOuter Value(sbyte? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteSByte(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(byte value)
    {
        MessagePackBinary.WriteByte(_stream, value);
        return _outer;
    }

    public TOuter Value(byte? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteByte(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(short value)
    {
        MessagePackBinary.WriteInt16(_stream, value);
        return _outer;
    }

    public TOuter Value(short? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteInt16(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(ushort value)
    {
        MessagePackBinary.WriteUInt16(_stream, value);
        return _outer;
    }

    public TOuter Value(ushort? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteUInt16(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(int value)
    {
        MessagePackBinary.WriteInt32(_stream, value);
        return _outer;
    }

    public TOuter Value(int? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteInt32(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(uint value)
    {
        MessagePackBinary.WriteUInt32(_stream, value);
        return _outer;
    }

    public TOuter Value(uint? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteUInt32(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(long value)
    {
        MessagePackBinary.WriteInt64(_stream, value);
        return _outer;
    }

    public TOuter Value(long? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteInt64(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(ulong value)
    {
        MessagePackBinary.WriteUInt64(_stream, value);
        return _outer;
    }

    public TOuter Value(ulong? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteUInt64(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(float value)
    {
        MessagePackBinary.WriteSingle(_stream, value);
        return _outer;
    }

    public TOuter Value(float? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteSingle(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(double value)
    {
        MessagePackBinary.WriteDouble(_stream, value);
        return _outer;
    }

    public TOuter Value(double? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteDouble(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(bool value)
    {
        MessagePackBinary.WriteBoolean(_stream, value);
        return _outer;
    }

    public TOuter Value(bool? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteBoolean(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(DateTime value)
    {
        MessagePackBinary.WriteDateTime(_stream, value);
        return _outer;
    }

    public TOuter Value(DateTime? value)
    {
        if (value.HasValue)
        {
            MessagePackBinary.WriteDateTime(_stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(_stream);
        }
        return _outer;
    }

    public TOuter Value(byte[] value)
    {
        MessagePackBinary.WriteBytes(_stream, value);
        return _outer;
    }

    public TOuter Value(ReadOnlyMemory<byte> value)
    {
        var seg = value.GetArraySegment();
        MessagePackBinary.WriteBytes(_stream, seg.Array, seg.Offset, seg.Count);
        return _outer;
    }

    public TOuter Value(ReadOnlyMemory<byte>? value)
    {
        if (value == null)
        {
            MessagePackBinary.WriteNil(_stream);
            return _outer;
        }
        var seg = value.Value.GetArraySegment();

        MessagePackBinary.WriteBytes(_stream, seg.Array, seg.Offset, seg.Count);
        return _outer;
    }

    public TOuter Nil()
    {
        MessagePackBinary.WriteNil(_stream);
        return _outer;
    }

    public TOuter Value(object value)
    {
        return value switch
        {
            null => Nil(),
            bool b => Value(b),
            string s => Value(s),
            char c => Value(c),
            sbyte i => Value(i),
            byte i => Value(i),
            short i => Value(i),
            ushort i => Value(i),
            int i => Value(i),
            uint i => Value(i),
            long i => Value(i),
            ulong i => Value(i),
            float f => Value(f),
            double f => Value(f),
            DateTime dt => Value(dt),
            byte[] buf => Value(buf),
            ArraySegment<byte> buf => Value(buf),
            Memory<byte> buf => Value(buf),
            ReadOnlyMemory<byte> buf => Value(buf),
            IReadOnlyCollection<object> array => WriteArray(array),
            IReadOnlyDictionary<string, object> map => WriteMap(map),
            _ => WritePocoObject(value),
        };
    }

    private TOuter WriteArray(IReadOnlyCollection<object> array)
    {
        MessagePackBinary.WriteArrayHeader(_stream, array.Count);
        foreach (var item in array)
        {
            Value(item);
        }
        return _outer;
    }

    private TOuter WriteMap(IReadOnlyDictionary<string, object> map)
    {
        MessagePackBinary.WriteMapHeader(_stream, map.Count);
        foreach (var (k, v) in map)
        {
            Value(k);
            Value(v);
        }
        return _outer;
    }

    private TOuter WritePocoObject(object value)
    {
        Dictionary<string, object> dict = new();
        var props = value.GetType().GetProperties(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public);
        foreach (var prop in props)
        {
            if (prop.GetIndexParameters().Length > 0)
            {
                continue;
            }
            if (prop.GetGetMethod(true) == null)
            {
                continue;
            }
            dict[prop.Name] = prop.GetValue(value);
        }
        return WriteMap(dict);
    }
}

public struct MessagePackArrayWriter<TOuter>
{
    private readonly TOuter _outer;
    private readonly Stream _stream;
    private int _count;

    internal MessagePackArrayWriter(Stream stream, TOuter outer, int count)
    {
        _stream = stream;
        _outer = outer;
        _count = count;
    }

    public MessagePackWriter<MessagePackArrayWriter<TOuter>> Item()
    {
        DecreaseCount();
        return new(_stream, this);
    }

    public MessagePackWriter<TOuter> TailItem()
    {
        DecreaseCount();
        if (_count != 0)
        {
            throw new InvalidDataException("Too less item for this array.");
        }
        return new(_stream, _outer);
    }

    public MessagePackArrayWriter<TOuter> Item<TValue>(
        Func<MessagePackWriter<MessagePackTerminator<Stream>>, TValue, MessagePackTerminator<Stream>> func,
        TValue value)
    {
        DecreaseCount();
        _ = func(new(_stream, new(_stream)), value);
        return this;
    }

    public MessagePackArrayWriter<TOuter> Text(string text)
    {
        DecreaseCount();
        MessagePackBinary.WriteString(_stream, text);
        return this;
    }

    public MessagePackArrayWriter<TOuter> Int(int value)
    {
        DecreaseCount();
        MessagePackBinary.WriteInt32(_stream, value);
        return this;
    }

    public MessagePackArrayWriter<TOuter> Boolean(bool value)
    {
        DecreaseCount();
        MessagePackBinary.WriteBoolean(_stream, value);
        return this;
    }

    public MessagePackArrayWriter<TOuter> Bytes(ReadOnlyMemory<byte> value)
    {
        DecreaseCount();
        var segment = value.GetArraySegment();
        MessagePackBinary.WriteBytes(_stream, segment.Array);
        return this;
    }

    public MessagePackArrayWriter<TOuter> Nil()
    {
        DecreaseCount();
        MessagePackBinary.WriteNil(_stream);
        return this;
    }

    public MessagePackValueWriter<MessagePackArrayWriter<TOuter>> Simple()
    {
        DecreaseCount();
        return new(_stream, this);
    }

    public MessagePackWriter<MessagePackArrayWriter<TOuter>> When(bool condition)
    {
        if (condition)
        {
            DecreaseCount();
            return new(_stream, this);
        }
        else
        {
            return new(Stream.Null, this);
        }
    }

    public TOuter EndArray()
    {
        if (_count != 0)
        {
            throw new InvalidDataException("Too less item for this array.");
        }
        return _outer;
    }

    private void DecreaseCount()
    {
        if (_count <= 0)
        {
            throw new InvalidDataException("Too many items for this array.");
        }
        _count--;
    }
}

public struct MessagePackMapWriter<TOuter>
{
    private readonly TOuter _outer;
    private readonly Stream _stream;
    private int _count;

    public MessagePackMapWriter(Stream stream, TOuter outer, int count)
    {
        _stream = stream;
        _outer = outer;
        _count = count;
    }

    public MessagePackWriter<MessagePackMapWriter<TOuter>> Key(string key)
    {
        DecreaseCount();
        MessagePackBinary.WriteString(_stream, key);
        return new(_stream, this);
    }

    public MessagePackMapWriter<TOuter> Key<TValue>(
        string key,
        Func<MessagePackWriter<MessagePackTerminator<Stream>>, TValue, MessagePackTerminator<Stream>> func,
        TValue value)
    {
        DecreaseCount();
        MessagePackBinary.WriteString(_stream, key);
        _ = func(new(_stream, new(_stream)), value);
        return this;
    }

    public MessagePackMapWriter<TOuter> Text(string key, string value)
    {
        DecreaseCount();
        MessagePackBinary.WriteString(_stream, key);
        MessagePackBinary.WriteString(_stream, value);
        return this;
    }

    public MessagePackMapWriter<TOuter> Int(string key, int value)
    {
        DecreaseCount();
        MessagePackBinary.WriteString(_stream, key);
        MessagePackBinary.WriteInt32(_stream, value);
        return this;
    }

    public MessagePackMapWriter<TOuter> Nil(string key)
    {
        DecreaseCount();
        MessagePackBinary.WriteString(_stream, key);
        MessagePackBinary.WriteNil(_stream);
        return this;
    }

    public MessagePackValueWriter<MessagePackMapWriter<TOuter>> Simple(string key)
    {
        DecreaseCount();
        MessagePackBinary.WriteString(_stream, key);
        return new(_stream, this);
    }

    public TOuter EndMap()
    {
        if (_count != 0)
        {
            throw new InvalidDataException("Too less item for this map.");
        }
        return _outer;
    }

    private void DecreaseCount()
    {
        if (_count <= 0)
        {
            throw new InvalidDataException("Too many items for this map.");
        }
        _count--;
    }
}
#nullable restore