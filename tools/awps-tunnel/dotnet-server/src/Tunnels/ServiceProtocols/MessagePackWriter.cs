using System;
using System.Buffers;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;

using MPW = MessagePack.MessagePackWriter;

#nullable enable

public static class MessagePackWriter
{
    public static MessagePackWriter<MessagePackTerminator<TWriter>> Create<TWriter>(TWriter writer)
        where TWriter : IBufferWriter<byte> =>
        new(writer, new(writer));
}

public readonly struct MessagePackWriter<TOuter>
    where TOuter : struct
{
    private readonly TOuter _outer;
    private readonly IBufferWriter<byte> _writer;

    public MessagePackWriter(IBufferWriter<byte> writer, TOuter outer)
    {
        _writer = writer;
        _outer = outer;
    }

    public TOuter Text(string text)
    {
        var w = new MPW(_writer);
        w.Write(text);
        w.Flush();
        return _outer;
    }

    public TOuter NullableText(string? text)
    {
        var w = new MPW(_writer);
        w.Write(text);
        w.Flush();
        return _outer;
    }

    public TOuter Int(int value)
    {
        var w = new MPW(_writer);
        w.Write(value);
        w.Flush();
        return _outer;
    }

    public TOuter Nil()
    {
        var w = new MPW(_writer);
        w.WriteNil();
        w.Flush();
        return _outer;
    }

    public MessagePackValueWriter<TOuter> Simple() =>
        new(_writer, _outer);

    public MessagePackArrayWriter<TOuter> Array(int count)
    {
        var w = new MPW(_writer);
        w.WriteArrayHeader(count);
        w.Flush();
        return new(_writer, _outer, count);
    }

    public TOuter StringArray(IReadOnlyCollection<string?> array)
    {
        var mpw = new MPW(_writer);
        if (array == null)
        {
            // null as empty.
            mpw.WriteArrayHeader(0);
            mpw.Flush();
            return _outer;
        }
        mpw.WriteArrayHeader(array.Count);
        foreach (var value in array)
        {
            mpw.Write(value);
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter NullableStringArray(IReadOnlyCollection<string?>? array)
    {
        var mpw = new MPW(_writer);
        if (array == null)
        {
            mpw.WriteNil();
            mpw.Flush();
            return _outer;
        }
        mpw.WriteArrayHeader(array.Count);
        foreach (var value in array)
        {
            mpw.Write(value);
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter PayloadArray(IReadOnlyCollection<ReadOnlyMemory<byte>> payloads)
    {
        var mpw = new MPW(_writer);
        mpw.WriteArrayHeader(payloads.Count);
        foreach (var payload in payloads)
        {
            mpw.Write(new ReadOnlySequence<byte>(payload));
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter EmptyArray()
    {
        var mpw = new MPW(_writer);
        mpw.WriteArrayHeader(0);
        mpw.Flush();
        return _outer;
    }

    public TOuter NullableArray<TValue>(
        IReadOnlyCollection<TValue>? array,
        Func<MessagePackWriter<MessagePackTerminator<object?>>, TValue, MessagePackTerminator<object?>> func)
    {
        if (array == null)
        {
            return Nil();
        }
        return Array(array, func);
    }

    public TOuter Array<TValue>(
        IReadOnlyCollection<TValue> array,
        Func<MessagePackWriter<MessagePackTerminator<object?>>, TValue, MessagePackTerminator<object?>> func)
    {
        if (array.Count == 0)
        {
            return EmptyArray();
        }
        var mpw = new MPW(_writer);
        mpw.WriteArrayHeader(array.Count);
        mpw.Flush();
        foreach (var item in array)
        {
            _ = func(new(_writer, new(null)), item);
        }
        return _outer;
    }

    public MessagePackMapWriter<TOuter> Map(int count)
    {
        var mpw = new MPW(_writer);
        mpw.WriteMapHeader(count);
        mpw.Flush();
        return new(_writer, _outer, count);
    }

    public TOuter Map<TValue>(
        IReadOnlyDictionary<string, TValue> dict,
        Func<MessagePackWriter<MessagePackTerminator<object?>>, TValue, MessagePackTerminator<object?>> func)
    {
        if (dict.Count == 0)
        {
            return EmptyMap();
        }
        var mpw = new MPW(_writer);
        mpw.WriteMapHeader(dict.Count);
        foreach (var (k, v) in dict)
        {
            mpw.Write(k);
            mpw.Flush();
            _ = func(new(_writer, new(null)), v);
        }
        return _outer;
    }

    public TOuter IntMap(IReadOnlyDictionary<string, int> dict)
    {
        if (dict.Count == 0)
        {
            return EmptyMap();
        }
        var mpw = new MPW(_writer);
        mpw.WriteMapHeader(dict.Count);
        foreach (var (k, v) in dict)
        {
            mpw.Write(k);
            mpw.Write(v);
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter StringMap(IImmutableDictionary<string, string?> dict)
    {
        if (dict.Count == 0)
        {
            return EmptyMap();
        }
        var mpw = new MPW(_writer);
        mpw.WriteMapHeader(dict.Count);
        foreach (var (k, v) in dict)
        {
            mpw.Write(k);
            mpw.Write(v);
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter DateTimeMap(IReadOnlyDictionary<string, DateTime> dict)
    {
        if (dict.Count == 0)
        {
            return EmptyMap();
        }
        var mpw = new MPW(_writer);
        mpw.WriteMapHeader(dict.Count);
        foreach (var (k, v) in dict)
        {
            mpw.Write(k);
            mpw.Write(v);
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter PayloadsMap(IDictionary<string, ReadOnlyMemory<byte>>? payloads)
    {
        if (payloads?.Count > 0)
        {
            var mpw = new MPW(_writer);
            mpw.WriteMapHeader(payloads.Count);
            foreach (var (k, v) in payloads)
            {
                mpw.Write(k);
                mpw.Write(v.Span);
            }
            mpw.Flush();
            return _outer;
        }
        return EmptyMap();
    }

    public TOuter EmptyMap()
    {
        var mpw = new MPW(_writer);
        mpw.WriteMapHeader(0);
        mpw.Flush();
        return _outer;
    }
}

public readonly struct MessagePackTerminator<T>
{
    private readonly T _obj;
    public MessagePackTerminator(T obj) => _obj = obj;
    public T Terminate() => _obj;
}

public readonly struct MessagePackValueWriter<TOuter>
    where TOuter : struct
{
    private readonly IBufferWriter<byte> _writer;
    private readonly TOuter _outer;

    internal MessagePackValueWriter(IBufferWriter<byte> writer, TOuter outer)
    {
        _writer = writer;
        _outer = outer;
    }

    public TOuter Value(string? text)
    {
        var mpw = new MPW(_writer);
        mpw.Write(text);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(char value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(char? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(sbyte value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(sbyte? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(byte value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(byte? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(short value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(short? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(ushort value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(ushort? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(int value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(int? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(uint value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(uint? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(long value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(long? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(ulong value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(ulong? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(float value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(float? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(double value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(double? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(bool value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(bool? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(DateTime value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(DateTime? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(byte[] value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(ReadOnlyMemory<byte>? value)
    {
        var mpw = new MPW(_writer);
        if (value.HasValue)
        {
            mpw.Write(value.Value.Span);
        }
        else
        {
            mpw.WriteNil();
        }
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(ReadOnlyMemory<byte> value)
    {
        var mpw = new MPW(_writer);
        mpw.Write(value.Span);
        mpw.Flush();
        return _outer;
    }

    public TOuter Nil()
    {
        var mpw = new MPW(_writer);
        mpw.WriteNil();
        mpw.Flush();
        return _outer;
    }

    public TOuter Value(object? value)
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
            IReadOnlyDictionary<string, object?> map => WriteMap(map),
            _ => WritePocoObject(value),
        };
    }

    private TOuter WriteArray(IReadOnlyCollection<object?> array)
    {
        var mpw = new MPW(_writer);
        mpw.WriteArrayHeader(array.Count);
        mpw.Flush();
        foreach (var item in array)
        {
            Value(item);
        }
        return _outer;
    }

    private TOuter WriteMap(IReadOnlyDictionary<string, object?> map)
    {
        var mpw = new MPW(_writer);
        mpw.WriteMapHeader(map.Count);
        mpw.Flush();
        foreach (var (k, v) in map)
        {
            Value(k);
            Value(v);
        }
        return _outer;
    }

    private TOuter WritePocoObject(object value)
    {
        Dictionary<string, object?> dict = new();
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
    where TOuter : struct
{
    private readonly IBufferWriter<byte> _writer;
    private readonly TOuter _outer;
    private int _count;

    internal MessagePackArrayWriter(IBufferWriter<byte> writer, TOuter outer, int count)
    {
        _writer = writer;
        _outer = outer;
        _count = count;
    }

    public MessagePackWriter<MessagePackArrayWriter<TOuter>> Item()
    {
        DecreaseCount();
        return new(_writer, this);
    }

    public MessagePackWriter<TOuter> TailItem()
    {
        DecreaseCount();
        if (_count != 0)
        {
            throw new InvalidDataException("Too less item for this array.");
        }
        return new(_writer, _outer);
    }

    public MessagePackArrayWriter<TOuter> Text(string text)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(text);
        mpw.Flush();
        return this;
    }

    public MessagePackArrayWriter<TOuter> NullableText(string? text)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(text);
        mpw.Flush();
        return this;
    }

    public MessagePackArrayWriter<TOuter> Int(int value)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return this;
    }

    public MessagePackArrayWriter<TOuter> Boolean(bool value)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(value);
        mpw.Flush();
        return this;
    }

    public MessagePackArrayWriter<TOuter> Bytes(ReadOnlyMemory<byte> value)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(value.Span);
        mpw.Flush();
        return this;
    }

    public MessagePackArrayWriter<TOuter> Nil()
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.WriteNil();
        mpw.Flush();
        return this;
    }

    public MessagePackValueWriter<MessagePackArrayWriter<TOuter>> Simple()
    {
        DecreaseCount();
        return new(_writer, this);
    }

    public MessagePackWriter<MessagePackArrayWriter<TOuter>> When(bool condition)
    {
        if (condition)
        {
            DecreaseCount();
            return new(_writer, this);
        }
        else
        {
            return new(NullBufferWriter.Instance, this);
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
    where TOuter : struct
{
    private readonly TOuter _outer;
    private readonly IBufferWriter<byte> _writer;
    private int _count;

    public MessagePackMapWriter(IBufferWriter<byte> writer, TOuter outer, int count)
    {
        _writer = writer;
        _outer = outer;
        _count = count;
    }

    public MessagePackWriter<MessagePackMapWriter<TOuter>> Key(string key)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(key);
        mpw.Flush();
        return new(_writer, this);
    }

    public MessagePackMapWriter<TOuter> Key<TValue>(
        string key,
        Func<MessagePackWriter<MessagePackTerminator<object?>>, TValue, MessagePackTerminator<object?>> func,
        TValue value)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(key);
        mpw.Flush();
        _ = func(new(_writer, new(null)), value);
        return this;
    }

    public MessagePackMapWriter<TOuter> Text(string key, string? value)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(key);
        mpw.Write(value);
        mpw.Flush();
        return this;
    }

    public MessagePackMapWriter<TOuter> Int(string key, int value)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(key);
        mpw.Write(value);
        mpw.Flush();
        return this;
    }

    public MessagePackMapWriter<TOuter> Nil(string key)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(key);
        mpw.WriteNil();
        mpw.Flush();
        return this;
    }

    public MessagePackValueWriter<MessagePackMapWriter<TOuter>> Simple(string key)
    {
        DecreaseCount();
        var mpw = new MPW(_writer);
        mpw.Write(key);
        mpw.Flush();
        return new(_writer, this);
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

internal sealed class NullBufferWriter : IBufferWriter<byte>
{
    public static readonly IBufferWriter<byte> Instance = new NullBufferWriter();

    private volatile byte[] _buffer = new byte[4096];

    public void Advance(int count)
    {
    }

    public Memory<byte> GetMemory(int sizeHint = 0)
    {
        var buffer = _buffer;
        if (sizeHint > buffer.Length)
        {
            buffer = new byte[sizeHint];
            _buffer = buffer;
        }
        return buffer;
    }

    public Span<byte> GetSpan(int sizeHint = 0)
    {
        var buffer = _buffer;
        if (sizeHint > buffer.Length)
        {
            buffer = new byte[sizeHint];
            _buffer = buffer;
        }
        return buffer;
    }
}
