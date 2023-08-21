using System;
using System.Collections.Generic;
using System.IO;

using MessagePack;

#nullable disable
public static class MessagePackHelper
{
    internal static int ReadInt32(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            var readInt = MessagePackBinary.ReadInt32(input, offset, out var readSize);
            offset += readSize;
            return readInt;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }

        throw new InvalidDataException($"Reading '{field}' as Int32 failed.", msgPackException);
    }

    internal static long ReadInt64(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            var readInt = MessagePackBinary.ReadInt64(input, offset, out var readSize);
            offset += readSize;
            return readInt;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }

        throw new InvalidDataException($"Reading '{field}' as Int64 failed.", msgPackException);
    }

    internal static DateTime ReadDateTime(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            var readDateTime = MessagePackBinary.ReadDateTime(input, offset, out var readSize);
            offset += readSize;
            return readDateTime;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }
        throw new InvalidDataException($"Reading '{field}' as DateTime failed.", msgPackException);
    }

    internal static string ReadString(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            var readString = MessagePackBinary.ReadString(input, offset, out var readSize);
            offset += readSize;
            return readString;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }

        throw new InvalidDataException($"Reading '{field}' as String failed.", msgPackException);
    }

    internal static void SkipString(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            MessagePackBinary.ReadStringSegment(input, offset, out var readSize);
            offset += readSize;
            return;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }

        throw new InvalidDataException($"Skiping '{field}' as String failed.", msgPackException);
    }

    internal static bool ReadBoolean(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            var readBool = MessagePackBinary.ReadBoolean(input, offset, out var readSize);
            offset += readSize;
            return readBool;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }

        throw new InvalidDataException($"Reading '{field}' as Boolean failed.", msgPackException);
    }

    internal static long ReadMapLength(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            var readMap = MessagePackBinary.ReadMapHeader(input, offset, out var readSize);
            offset += readSize;
            return readMap;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }

        throw new InvalidDataException($"Reading map length for '{field}' failed.", msgPackException);
    }

    internal static bool IsNil(byte[] input, ref int offset)
    {
        if (input[offset] == 0xc0)
        {
            offset++;
            return true;
        }
        return false;
    }

    internal static long ReadArrayLength(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            var readArray = MessagePackBinary.ReadArrayHeader(input, offset, out var readSize);
            offset += readSize;
            return readArray;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }

        throw new InvalidDataException($"Reading array length for '{field}' failed.", msgPackException);
    }

    internal static string[] ReadStringArray(byte[] input, ref int offset, string field)
    {
        var arrayLength = ReadArrayLength(input, ref offset, field);
        if (arrayLength > 0)
        {
            var array = new string[arrayLength];
            for (int i = 0; i < arrayLength; i++)
            {
                array[i] = ReadString(input, ref offset, $"{field}[{i}]");
            }

            return array;
        }

        return Array.Empty<string>();
    }

    internal static void WriteStringArray(Stream stream, IReadOnlyCollection<string> values)
    {
        if (values == null)
        {
            // null as empty.
            MessagePackBinary.WriteArrayHeader(stream, 0);
            return;
        }
        MessagePackBinary.WriteArrayHeader(stream, values.Count);
        foreach (var value in values)
        {
            MessagePackBinary.WriteString(stream, value);
        }
    }

    internal static string[] ReadNullableStringArray(byte[] input, ref int offset, string field)
    {
        if (IsNil(input, ref offset))
        {
            return null;
        }
        return ReadStringArray(input, ref offset, field);
    }

    internal static void WriteNullableStringArray(Stream stream, IReadOnlyCollection<string> values)
    {
        if (values == null)
        {
            MessagePackBinary.WriteNil(stream);
            return;
        }
        MessagePackBinary.WriteArrayHeader(stream, values.Count);
        foreach (var value in values)
        {
            MessagePackBinary.WriteString(stream, value);
        }
    }

    internal static ArraySegment<byte> ReadBytes(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            var readBytes = MessagePackBinary.ReadBytesSegment(input, offset, out var readSize);
            offset += readSize;
            return readBytes;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }

        throw new InvalidDataException($"Reading '{field}' as Byte[] failed.", msgPackException);
    }

    internal static ulong ReadUInt64(byte[] input, ref int offset, string field)
    {
        Exception msgPackException;
        try
        {
            var value = MessagePackBinary.ReadUInt64(input, offset, out var readSize);
            offset += readSize;
            return value;
        }
        catch (Exception e)
        {
            msgPackException = e;
        }

        throw new InvalidDataException($"Reading '{field}' as UInt64 failed.", msgPackException);
    }

    internal static ulong? ReadNullableUInt64(byte[] input, ref int offset, string field)
    {
        if (IsNil(input, ref offset))
        {
            return null;
        }
        return ReadUInt64(input, ref offset, field);
    }

    internal static void WriteNullableUInt64(Stream stream, ulong? value)
    {
        if (value != null)
        {
            MessagePackBinary.WriteUInt64(stream, value.Value);
        }
        else
        {
            MessagePackBinary.WriteNil(stream);
        }
    }

    internal static uint ReadUInt32(byte[] input, ref int offset, string field)
    {
        try
        {
            var value = MessagePackBinary.ReadUInt32(input, offset, out var readSize);
            offset += readSize;
            return value;
        }
        catch (Exception e)
        {
            throw new InvalidDataException($"Reading '{field}' as UInt32 failed.", e);
        }
    }

    internal static void SkipNextBlocks(byte[] input, ref int offset, int ignoreCount)
    {
        for (var i = 0; i < ignoreCount; i++)
        {
            var c = MessagePackBinary.ReadNextBlock(input, offset);
            offset += c;
        }
    }

    internal static void WriteNullableDictionary(Stream stream, ICollection<KeyValuePair<string, string>> values)
    {
        if (values == null)
        {
            MessagePackBinary.WriteNil(stream);
            return;
        }
        MessagePackBinary.WriteMapHeader(stream, values.Count);
        foreach (var (key, value) in values)
        {
            MessagePackBinary.WriteString(stream, key);
            MessagePackBinary.WriteString(stream, value);
        }
    }
}
#nullable restore