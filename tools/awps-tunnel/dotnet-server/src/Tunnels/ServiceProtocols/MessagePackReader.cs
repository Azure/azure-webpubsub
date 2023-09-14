using System;
using System.Buffers;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Diagnostics;
using System.IO;
using System.Runtime.CompilerServices;

using MessagePack;

using Microsoft.Azure.SignalR.Protocol;

using MPR = MessagePack.MessagePackReader;

#nullable enable

public static class MessagePackReader
{
    public static MessagePackReader<MessagePackTerminator> Create(
        in ReadOnlyMemory<byte> sequence) =>
        new(new(new(sequence)), new());

    public static MessagePackReader<MessagePackTerminator> Create(
        in ReadOnlySequence<byte> sequence) =>
        new(new(sequence), new());
}

public readonly struct MessagePackTerminator
{
    public void Terminate() { }
}

public readonly struct MessagePackReader<TOuter>
    where TOuter : struct
{
    private readonly StrongBox<ReadOnlySequence<byte>> _sequence;
    private readonly TOuter _outer;
    private readonly string _fieldName;

    public MessagePackReader(StrongBox<ReadOnlySequence<byte>> sequence, TOuter outer, string fieldName = "")
    {
        _sequence = sequence;
        _outer = outer;
        _fieldName = fieldName;
    }

    public TOuter Text(
        out string value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var result = NullableText(out var text, fieldName);
        if (text is null)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid (nil).");
        }
        value = text;
        return result;
    }

    public TOuter NullableText(
        out string? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadString();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Int(
        out int value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadInt32();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public MessagePackValueReader<TOuter> Simple(string fieldName = "") =>
        new(_sequence, _outer, FieldDisplayName(fieldName));

    public TOuter StringArray(
        out string[] value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (!mpr.TryReadArrayHeader(out var count))
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.");
        }
        if (count == 0)
        {
            value = System.Array.Empty<string>();
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            return _outer;
        }
        value = new string[count];
        for (int i = 0; i < count; i++)
        {
            try
            {
                value[i] = mpr.ReadString()!;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName, i)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter NullableStringArray(
        out string[]? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            return _outer;
        }
        return StringArray(out value, fieldName);
    }

    public TOuter PayloadArray(
        out ReadOnlyMemory<byte>[] value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (!mpr.TryReadArrayHeader(out var count))
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.");
        }
        if (count == 0)
        {
            value = System.Array.Empty<ReadOnlyMemory<byte>>();
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            return _outer;
        }
        value = new ReadOnlyMemory<byte>[count];
        for (int i = 0; i < count; i++)
        {
            try
            {
                var seq = mpr.ReadBytes()!.Value;
                Debug.Assert(seq.IsSingleSegment);
                value[i] = seq.First;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName, i)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter ObjectArray(
        out object?[] value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var reader = Array(fieldName);
        value = new object[reader.Count];
        for (int i = 0; i < reader.Count; i++)
        {
            reader.Simple().Value(out value[i]);
        }
        return reader.EndArray();
    }

    public MessagePackArrayReader<TOuter> Array(string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (!mpr.TryReadArrayHeader(out var count))
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.");
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return new MessagePackArrayReader<TOuter>(_sequence, _outer, count, FieldDisplayName(fieldName));
    }

    public MessagePackArrayReader<TOuter> NullableArray(
        out bool isNull,
#if DEBUG
        [CallerArgumentExpression("isNull")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            isNull = true;
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            return new MessagePackArrayReader<TOuter>(_sequence, _outer, 0, FieldDisplayName(fieldName));
        }
        isNull = false;
        return Array(fieldName);
    }

    public MessagePackMapReader<TOuter> Map(string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (!mpr.TryReadMapHeader(out var count))
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.");
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return new MessagePackMapReader<TOuter>(_sequence, _outer, count, FieldDisplayName(fieldName));
    }

    public MessagePackImmutableMapReader<TOuter> ImmutableMap(string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (!mpr.TryReadMapHeader(out var count))
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.");
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return new MessagePackImmutableMapReader<TOuter>(_sequence, _outer, count, FieldDisplayName(fieldName));
    }

    public MessagePackMapReader<TOuter> NullableMap(
        out bool isNull,
#if DEBUG
        [CallerArgumentExpression("isNull")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            isNull = true;
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            return new(_sequence, _outer, 0, FieldDisplayName(fieldName));
        }
        isNull = false;
        return Map(fieldName);
    }

    public TOuter Nullable(out bool isNull)
    {
        var mpr = new MPR(_sequence.Value);
        isNull = false;

        if (mpr.TryReadNil())
        {
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            isNull = true;
        }
        return _outer;
    }

    private string FieldDisplayName(string fieldName) =>
        (string.IsNullOrEmpty(_fieldName), string.IsNullOrEmpty(fieldName)) switch
        {
            (true, true) => string.Empty,
            (true, false) => fieldName,
            (false, true) => _fieldName,
            (false, false) => _fieldName + "/" + fieldName,
        };

    private string FieldDisplayName(string fieldName, int index) =>
        (string.IsNullOrEmpty(_fieldName), string.IsNullOrEmpty(fieldName)) switch
        {
            (true, true) => string.Empty,
            (true, false) => fieldName + $"({index})",
            (false, true) => _fieldName + $"({index})",
            (false, false) => _fieldName + "/" + fieldName + $"({index})",
        };
}

public readonly struct MessagePackValueReader<TOuter>
    where TOuter : struct
{
    private static readonly object BoxedTrue = true;
    private static readonly object BoxedFalse = false;

    private readonly StrongBox<ReadOnlySequence<byte>> _sequence;
    private readonly TOuter _outer;
    private readonly string _fieldName;

    internal MessagePackValueReader(StrongBox<ReadOnlySequence<byte>> sequence, TOuter outer, string fieldName)
    {
        _sequence = sequence;
        _outer = outer;
        _fieldName = fieldName;
    }

    public TOuter Value(
        out string? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadString();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out char value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadChar();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out char? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadChar();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out sbyte value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadSByte();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out sbyte? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadSByte();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out byte value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadByte();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out byte? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadByte();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out short value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadInt16();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out short? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadInt16();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out ushort value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadUInt16();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out ushort? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadUInt16();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out int value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadInt32();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out int? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadInt32();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out uint value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadUInt32();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out uint? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadUInt32();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out long value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadInt64();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out long? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadInt64();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out ulong value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadUInt64();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out ulong? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadUInt64();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out float value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadSingle();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out float? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadSingle();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out double value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadDouble();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out double? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadDouble();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out bool value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadBoolean();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out bool? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadBoolean();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out DateTime value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadDateTime();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out DateTime? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                value = mpr.ReadDateTime();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out byte[] value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            var seq = mpr.ReadBytes();
            if (seq != null)
            {
                value = seq.Value.ToArray();
                _sequence.Value = _sequence.Value.Slice(mpr.Position);
                return _outer;
            }
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.");
    }

    public TOuter Value(
        out ReadOnlyMemory<byte>? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        if (mpr.TryReadNil())
        {
            value = null;
        }
        else
        {
            try
            {
                var seq = mpr.ReadBytes();
                if (seq != null)
                {
                    value = seq.Value.ToArray();
                }
                else
                {
                    throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.");
                }
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }

        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Value(
        out ReadOnlyMemory<byte> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            var seq = mpr.ReadBytes();
            if (seq != null)
            {
                value = seq.Value.ToArray();
                _sequence.Value = _sequence.Value.Slice(mpr.Position);
                return _outer;
            }
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.");
    }

    /// <summary>
    /// Do not use this, until you ensure source is byte[].
    /// </summary>
    public TOuter DangerousValue(
        out ReadOnlyMemory<byte> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            var seq = mpr.ReadBytes();
            if (seq != null && seq.Value.IsSingleSegment)
            {
                value = seq.Value.First;
                _sequence.Value = _sequence.Value.Slice(mpr.Position);
                return _outer;
            }
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.");
    }

    public TOuter Nil()
    {
        var mpr = new MPR(_sequence.Value);
        try
        {
            mpr.ReadNil();
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            return _outer;
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
        }
    }

    public TOuter Value(out object? value)
    {
        var mpr = new MPR(_sequence.Value);
        switch (mpr.NextMessagePackType)
        {
            case MessagePackType.Nil:
                value = null;
                _sequence.Value = _sequence.Value.Slice(1);
                return _outer;
            case MessagePackType.Boolean:
                value = mpr.ReadBoolean() ? BoxedTrue : BoxedFalse;
                _sequence.Value = _sequence.Value.Slice(mpr.Position);
                return _outer;
            case MessagePackType.String:
                value = mpr.ReadString();
                _sequence.Value = _sequence.Value.Slice(mpr.Position);
                return _outer;
            case MessagePackType.Binary:
                {
                    value = mpr.ReadBytes()!.Value.ToArray();
                    _sequence.Value = _sequence.Value.Slice(mpr.Position);
                    return _outer;
                }
            case MessagePackType.Array:
                {
                    var count = mpr.ReadArrayHeader();
                    _sequence.Value = _sequence.Value.Slice(mpr.Position);
                    if (count == 0)
                    {
                        value = Array.Empty<object>();
                        return _outer;
                    }
                    else
                    {
                        var array = new object?[count];
                        for (int i = 0; i < count; i++)
                        {
                            Value(out array[i]);
                        }
                        value = array;
                        return _outer;
                    }
                }
            case MessagePackType.Map:
                {
                    var count = mpr.ReadMapHeader();
                    _sequence.Value = _sequence.Value.Slice(mpr.Position);
                    if (count == 0)
                    {
                        value = new Dictionary<string, object?>();
                        return _outer;
                    }
                    else
                    {
                        var dict = new Dictionary<string, object?>(count);
                        for (int i = 0; i < count; i++)
                        {
                            mpr = new MPR(_sequence.Value);
                            var key = mpr.ReadString();
                            _sequence.Value = _sequence.Value.Slice(mpr.Position);
                            Value(out object? item);
                            dict.Add(key!, item);
                        }
                        value = dict;
                        return _outer;
                    }
                }
            case MessagePackType.Extension:
                value = mpr.ReadDateTime();
                _sequence.Value = _sequence.Value.Slice(mpr.Position);
                return _outer;
            default:
                switch (mpr.NextCode)
                {
                    case MessagePackCode.Float32:
                        value = mpr.ReadSingle();
                        _sequence.Value = _sequence.Value.Slice(mpr.Position);
                        return _outer;
                    case MessagePackCode.Float64:
                        value = mpr.ReadDouble();
                        _sequence.Value = _sequence.Value.Slice(mpr.Position);
                        return _outer;
                    case >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt:
                    case >= MessagePackCode.MinNegativeFixInt and <= MessagePackCode.MaxNegativeFixInt:
                    case MessagePackCode.Int8:
                    case MessagePackCode.UInt8:
                    case MessagePackCode.Int16:
                    case MessagePackCode.UInt16:
                    case MessagePackCode.Int32:
                        value = mpr.ReadInt32();
                        _sequence.Value = _sequence.Value.Slice(mpr.Position);
                        return _outer;
                    case MessagePackCode.UInt32:
                        {
                            var temp = mpr.ReadUInt32();
                            _sequence.Value = _sequence.Value.Slice(mpr.Position);
                            if (temp > int.MaxValue)
                            {
                                value = temp;
                            }
                            else
                            {
                                value = (int)temp;
                            }
                            return _outer;
                        }
                    case MessagePackCode.Int64:
                        value = mpr.ReadInt64();
                        _sequence.Value = _sequence.Value.Slice(mpr.Position);
                        return _outer;
                    case MessagePackCode.UInt64:
                        value = mpr.ReadUInt64();
                        _sequence.Value = _sequence.Value.Slice(mpr.Position);
                        return _outer;
                    default:
                        throw new InvalidDataException($"Field {_fieldName} is invalid.");
                }
        }
    }

    private string FieldDisplayName(string fieldName) =>
        (string.IsNullOrEmpty(_fieldName), string.IsNullOrEmpty(fieldName)) switch
        {
            (true, true) => string.Empty,
            (true, false) => fieldName,
            (false, true) => _fieldName,
            (false, false) => _fieldName + "/" + fieldName,
        };
}

public struct MessagePackArrayReader<TOuter>
    where TOuter : struct
{
    public readonly int Count;

    private readonly StrongBox<ReadOnlySequence<byte>> _sequence;
    private readonly TOuter _outer;
    private readonly string _fieldName;

    private int _index;

    internal MessagePackArrayReader(StrongBox<ReadOnlySequence<byte>> sequence, TOuter outer, int count, string fieldName)
    {
        _sequence = sequence;
        _outer = outer;
        Count = count;
        _fieldName = fieldName;
        _index = 0;
    }

    public MessagePackArrayReader<TOuter> Text(
        out string value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        NullableText(out var text, fieldName);
        if (text is null)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid (nil).");
        }
        value = text;
        return this;
    }

    public MessagePackArrayReader<TOuter> NullableText(
        out string? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        IncreaseIndex(fieldName);
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadString();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return this;
    }

    public MessagePackArrayReader<TOuter> Int(
        out int value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        IncreaseIndex(fieldName);
        var mpr = new MPR(_sequence.Value);
        try
        {
            value = mpr.ReadInt32();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return this;
    }

    public MessagePackArrayReader<TOuter> Bytes(
        out ReadOnlyMemory<byte> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        IncreaseIndex(fieldName);
        var mpr = new MPR(_sequence.Value);
        ReadOnlySequence<byte>? seq;
        try
        {
            seq = mpr.ReadBytes();
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
        }
        if (seq == null)
        {
            throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is null.");
        }
        value = seq.Value.ToArray();
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return this;
    }

    public MessagePackValueReader<MessagePackArrayReader<TOuter>> Simple(string fieldName = "")
    {
        IncreaseIndex(fieldName);
        return new(_sequence, this, FieldDisplayName(fieldName));
    }

    public MessagePackReader<MessagePackArrayReader<TOuter>> Item(string fieldName = "")
    {
        IncreaseIndex(fieldName);
        return new(_sequence, this, FieldDisplayName(fieldName));
    }

    public MessagePackArrayReader<TOuter> SkipItem()
    {
        IncreaseIndex(string.Empty);
        var mpr = new MPR(_sequence.Value);
        mpr.Skip();
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return this;
    }

    public MessagePackReader<TOuter> TailItem(string fieldName = "")
    {
        IncreaseIndex(fieldName);
        EndArray(false);
        return new(_sequence, _outer, FieldDisplayName(fieldName));
    }

    public MessagePackArrayReader<TOuter> OptionalText(
        out string? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        if (HasOptional())
        {
            var mpr = new MPR(_sequence.Value);
            try
            {
                value = mpr.ReadString();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            return this;
        }
        value = null;
        return this;
    }

    public MessagePackArrayReader<TOuter> OptionalInt(
        out int? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        if (HasOptional())
        {
            var mpr = new MPR(_sequence.Value);
            try
            {
                value = mpr.ReadInt32();
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            return this;
        }
        value = default;
        return this;
    }

    public MessagePackArrayReader<TOuter> OptionalDateTime(
        out DateTime? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        if (HasOptional())
        {
            var mpr = new MPR(_sequence.Value);
            if (mpr.TryReadNil())
            {
                value = default;
            }
            else
            {
                try
                {
                    value = mpr.ReadDateTime();
                }
                catch (Exception ex)
                {
                    throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
                }
            }
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            return this;
        }
        value = default;
        return this;
    }

    public MessagePackArrayReader<TOuter> Optional<TValue>(
        Func<MessagePackReader<MessagePackTerminator>, StrongBox<TValue?>, MessagePackTerminator> func,
        out TValue? value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
        where TValue : notnull
    {
        value = default;
        if (HasOptional())
        {
            StrongBox<TValue?> box = new();
            func(new(_sequence, new(), FieldDisplayName(fieldName)), box);
            value = box.Value;
        }
        return this;
    }

    public TOuter ToList<TItem>(
        Func<MessagePackReader<MessagePackTerminator>, StrongBox<TItem?>, MessagePackTerminator> func,
        out List<TItem?> list,
#if DEBUG
        [CallerArgumentExpression("list")]
#endif
        string fieldName = "")
        where TItem : notnull
    {
        list = new(Count - _index);
        StrongBox<TItem?> box = new();
        while (HasOptional())
        {
            box.Value = default;
            func(new(_sequence, new(), FieldDisplayName(fieldName)), box);
            list.Add(box.Value);
        }
        return _outer;
    }

    /// <summary>
    /// Comparing to the other overload, this overload allows the list item to be non-nullable, while that of the other overload is always nullable.
    /// </summary>
    /// <typeparam name="TItem">TItem can be nullabel or non-nullable</typeparam>
    public TOuter ToList<TItem>(
        Func<MessagePackReader<TOuter>, (TOuter, TItem)> func,
        out List<TItem> list,
#if DEBUG
        [CallerArgumentExpression("list")]
#endif
        string fieldName = "")
    {
        list = new(Count - _index);
        while (HasOptional())
        {
            list.Add(func(new(_sequence, new(), FieldDisplayName(fieldName))).Item2);
        }
        return _outer;
    }

    public TOuter EndArray(bool skipOptionals = true)
    {
        if (skipOptionals)
        {
            var mpr = new MPR(_sequence.Value);
            while (_index != Count)
            {
                _index++;
                mpr.Skip();
            }
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
        }
        else if (_index != Count)
        {
            throw new InvalidDataException($"Have more items in array {_fieldName}.");
        }
        return _outer;
    }

    private void IncreaseIndex(string fieldName)
    {
        if (_index == Count)
        {
            throw new InvalidDataException($"No more item in array, field {_fieldName}.{fieldName}.");
        }
        _index++;
    }

    private bool HasOptional()
    {
        if (_index == Count)
        {
            return false;
        }
        _index++;
        return true;
    }

    private string FieldDisplayName(string fieldName) =>
        (string.IsNullOrEmpty(_fieldName), string.IsNullOrEmpty(fieldName)) switch
        {
            (true, true) => string.Empty,
            (true, false) => fieldName,
            (false, true) => _fieldName,
            (false, false) => _fieldName + "/" + fieldName,
        };
}

public readonly struct MessagePackMapReader<TOuter>
    where TOuter : struct
{
    private readonly StrongBox<ReadOnlySequence<byte>> _sequence;
    private readonly TOuter _outer;
    public readonly int Count;
    private readonly string _fieldName;

    internal MessagePackMapReader(StrongBox<ReadOnlySequence<byte>> sequence, TOuter outer, int count, string fieldName)
    {
        _sequence = sequence;
        _outer = outer;
        Count = count;
        _fieldName = fieldName;
    }

    public TOuter Text(
        out Dictionary<string, string?> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        value = new();
        var mpr = new MPR(_sequence.Value);
        for (int i = 0; i < Count; i++)
        {
            try
            {
                value.Add(mpr.ReadString()!, mpr.ReadString());
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName, i)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Int(
        out Dictionary<string, int> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        value = new();
        var mpr = new MPR(_sequence.Value);
        for (int i = 0; i < Count; i++)
        {
            try
            {
                value.Add(mpr.ReadString()!, mpr.ReadInt32());
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName, i)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter DateTime(
        out Dictionary<string, DateTime> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        value = new();
        var mpr = new MPR(_sequence.Value);
        for (int i = 0; i < Count; i++)
        {
            try
            {
                value.Add(mpr.ReadString()!, mpr.ReadDateTime());
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName, i)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    /// <summary>
    /// Do not use this, until you ensure source is byte[].
    /// </summary>
    public TOuter DangerousPayloads(
        out IDictionary<string, ReadOnlyMemory<byte>> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        if (Count == 0)
        {
            value = ImmutableDictionary<string, ReadOnlyMemory<byte>>.Empty;
            return _outer;
        }
        value = new ArrayDictionary<string, ReadOnlyMemory<byte>>(Count);
        var mpr = new MPR(_sequence.Value);
        for (int i = 0; i < Count; i++)
        {
            try
            {
                value.Add(mpr.ReadString()!, mpr.ReadBytes()!.Value.First);
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName, i)} is invalid.", ex);
            }
        }
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter ToDict<TValue>(
        Func<MessagePackReader<MessagePackTerminator>, StrongBox<TValue?>, MessagePackTerminator> func,
        out Dictionary<string, TValue?> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
        where TValue : notnull
    {
        value = new();
        StrongBox<TValue?> box = new();
        for (int i = 0; i < Count; i++)
        {
            var mpr = new MPR(_sequence.Value);
            string key;
            var fdn = FieldDisplayName(fieldName, i);
            try
            {
                key = mpr.ReadString()!;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {fdn} is invalid.", ex);
            }
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            _ = func(new(_sequence, new(), fdn), box);
            value.Add(key, box.Value);
            box.Value = default;
        }
        return _outer;
    }

    public TOuter Enumerate<TValue, TResult>(
        Func<MessagePackReader<MessagePackTerminator>, StrongBox<TValue?>, MessagePackTerminator> func,
        Func<TResult> seed,
        Func<TResult, string, TValue?, TResult> aggregator,
        out TResult result,
#if DEBUG
        [CallerArgumentExpression("result")]
#endif
        string fieldName = "")
        where TValue : notnull
    {
        result = seed();
        StrongBox<TValue?> box = new();
        for (int i = 0; i < Count; i++)
        {
            var mpr = new MPR(_sequence.Value);
            string key;
            var fdn = FieldDisplayName(fieldName, i);
            try
            {
                key = mpr.ReadString()!;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {fdn} is invalid.", ex);
            }
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            _ = func(new(_sequence, new(), fdn), box);
            result = aggregator(result, key!, box.Value);
            box.Value = default;
        }
        return _outer;
    }

    public TOuter Enumerate<TResult>(
        Func<TResult> init,
        Func<TResult, string, MessagePackReader<MessagePackTerminator>, MessagePackTerminator> func,
        out TResult result,
#if DEBUG
        [CallerArgumentExpression("result")]
#endif
        string fieldName = "")
        where TResult : class
    {
        result = init();
        for (int i = 0; i < Count; i++)
        {
            var mpr = new MPR(_sequence.Value);
            string key;
            var fdn = FieldDisplayName(fieldName, i);
            try
            {
                key = mpr.ReadString()!;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {fdn} is invalid.", ex);
            }
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            _ = func(result, key!, new(_sequence, new(), fdn));
        }
        return _outer;
    }

    public TOuter EndMap()
    {
        if (Count != 0)
        {
            throw new InvalidDataException($"Have more items in map {_fieldName}.");
        }
        return _outer;
    }

    private string FieldDisplayName(string fieldName, int index) =>
        (string.IsNullOrEmpty(_fieldName), string.IsNullOrEmpty(fieldName)) switch
        {
            (true, true) => string.Empty,
            (true, false) => fieldName + $"({index})",
            (false, true) => _fieldName + $"({index})",
            (false, false) => _fieldName + "/" + fieldName + $"({index})",
        };
}

public readonly struct MessagePackImmutableMapReader<TOuter>
    where TOuter : struct
{
    private readonly StrongBox<ReadOnlySequence<byte>> _sequence;
    private readonly TOuter _outer;
    public readonly int Count;
    private readonly string _fieldName;

    internal MessagePackImmutableMapReader(StrongBox<ReadOnlySequence<byte>> sequence, TOuter outer, int count, string fieldName)
    {
        _sequence = sequence;
        _outer = outer;
        Count = count;
        _fieldName = fieldName;
    }

    public TOuter Text(
        out ImmutableDictionary<string, string?> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var builder = ImmutableDictionary.CreateBuilder<string, string?>();
        var mpr = new MPR(_sequence.Value);
        for (int i = 0; i < Count; i++)
        {
            try
            {
                builder.Add(mpr.ReadString()!, mpr.ReadString());
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName, i)} is invalid.", ex);
            }
        }
        value = builder.ToImmutable();
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter Int(
        out ImmutableDictionary<string, int> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var builder = ImmutableDictionary.CreateBuilder<string, int>();
        var mpr = new MPR(_sequence.Value);
        for (int i = 0; i < Count; i++)
        {
            try
            {
                builder.Add(mpr.ReadString()!, mpr.ReadInt32());
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName, i)} is invalid.", ex);
            }
        }
        value = builder.ToImmutable();
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter DateTime(
        out ImmutableDictionary<string, DateTime> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
    {
        var builder = ImmutableDictionary.CreateBuilder<string, DateTime>();
        var mpr = new MPR(_sequence.Value);
        for (int i = 0; i < Count; i++)
        {
            try
            {
                builder.Add(mpr.ReadString()!, mpr.ReadDateTime());
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName, i)} is invalid.", ex);
            }
        }
        value = builder.ToImmutable();
        _sequence.Value = _sequence.Value.Slice(mpr.Position);
        return _outer;
    }

    public TOuter ToDict<TValue>(
        Func<MessagePackReader<MessagePackTerminator>, StrongBox<TValue?>, MessagePackTerminator> func,
        out ImmutableDictionary<string, TValue?> value,
#if DEBUG
        [CallerArgumentExpression("value")]
#endif
        string fieldName = "")
        where TValue : notnull
    {
        var builder = ImmutableDictionary.CreateBuilder<string, TValue?>();
        StrongBox<TValue?> box = new();
        for (int i = 0; i < Count; i++)
        {
            var mpr = new MPR(_sequence.Value);
            string key;
            var fdn = FieldDisplayName(fieldName, i);
            try
            {
                key = mpr.ReadString()!;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {fdn} is invalid.", ex);
            }
            _sequence.Value = _sequence.Value.Slice(mpr.Position);
            _ = func(new(_sequence, new(), fdn), box);
            builder.Add(key, box.Value);
            box.Value = default;
        }
        value = builder.ToImmutable();
        return _outer;
    }

    public TOuter EndMap()
    {
        if (Count != 0)
        {
            throw new InvalidDataException($"Have more items in map {_fieldName}.");
        }
        return _outer;
    }

    private string FieldDisplayName(string fieldName, int index) =>
        (string.IsNullOrEmpty(_fieldName), string.IsNullOrEmpty(fieldName)) switch
        {
            (true, true) => string.Empty,
            (true, false) => fieldName + $"({index})",
            (false, true) => _fieldName + $"({index})",
            (false, false) => _fieldName + "/" + fieldName + $"({index})",
        };
}
