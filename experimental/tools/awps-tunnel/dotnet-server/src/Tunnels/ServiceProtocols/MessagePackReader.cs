using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;

using MessagePack;
#nullable disable

    public static class MessagePackReader
    {
        public static MessagePackReader<MessagePackTerminator<TStream>> Create<TStream>(
            TStream stream)
            where TStream : Stream =>
            new(stream, new(stream));
    }

    public struct MessagePackReader<TOuter>
    {
        private readonly Stream _stream;
        private readonly TOuter _outer;
        private readonly string _fieldName;

        public MessagePackReader(Stream stream, TOuter outer, string fieldName = "")
        {
            _stream = stream;
            _outer = outer;
            _fieldName = fieldName;
        }

        public TOuter Text(out string value) =>
            Text(string.Empty, out value);

        public TOuter Text(string fieldName, out string value)
        {
            try
            {
                value = MessagePackBinary.ReadString(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }

        public TOuter Int(out int value) =>
            Int(string.Empty, out value);

        public TOuter Int(string fieldName, out int value)
        {
            try
            {
                value = MessagePackBinary.ReadInt32(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }

        public MessagePackValueReader<TOuter> Simple(string fieldName = "") =>
            new(_stream, _outer, FieldDisplayName(fieldName));

        public TOuter StringArray(out string[] value) =>
            StringArray(string.Empty, out value);

        public TOuter StringArray(string fieldName, out string[] value)
        {
            int count;
            try
            {
                count = MessagePackBinary.ReadArrayHeader(_stream);
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
            if (count == 0)
            {
                value = System.Array.Empty<string>();
                return _outer;
            }
            value = new string[count];
            for (int i = 0; i < count; i++)
            {
                try
                {
                    value[i] = MessagePackBinary.ReadString(_stream);
                }
                catch (Exception ex)
                {
                    throw new InvalidDataException($"Field {FieldDisplayName(fieldName)}/{i} is invalid.", ex);
                }
            }
            return _outer;
        }

        public TOuter ObjectArray(out object[] value) =>
            ObjectArray(string.Empty, out value);

        public TOuter ObjectArray(string fieldName, out object[] value)
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
            try
            {
                int count = MessagePackBinary.ReadArrayHeader(_stream);
                return new MessagePackArrayReader<TOuter>(_stream, _outer, count, FieldDisplayName(fieldName));
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }

        public MessagePackMapReader<TOuter> Map(string fieldName = "")
        {
            try
            {
                int count = MessagePackBinary.ReadMapHeader(_stream);
                return new MessagePackMapReader<TOuter>(_stream, _outer, count, FieldDisplayName(fieldName));
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
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

    public struct MessagePackValueReader<TOuter>
    {
        private static readonly object BoxedTrue = true;
        private static readonly object BoxedFalse = false;

        private readonly Stream _stream;
        private readonly TOuter _outer;
        private readonly string _fieldName;

        internal MessagePackValueReader(Stream stream, TOuter outer, string fieldName)
        {
            _stream = stream;
            _outer = outer;
            _fieldName = fieldName;
        }

        public TOuter Value(out string value)
        {
            try
            {
                value = MessagePackBinary.ReadString(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out char value)
        {
            try
            {
                value = MessagePackBinary.ReadChar(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out char? value)
        {
            Value(out ushort? u);
            if (u == null)
            {
                value = null;
            }
            else
            {
                value = (char)u;
            }
            return _outer;
        }

        public TOuter Value(out sbyte value)
        {
            try
            {
                value = MessagePackBinary.ReadSByte(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out sbyte? value)
        {
            var code = ReadU1();
            value = code switch
            {
                MessagePackCode.Nil => null,
                >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt => (sbyte)code,
                >= MessagePackCode.MinNegativeFixInt and <= MessagePackCode.MaxNegativeFixInt => GetNegativeFixInt(code),
                MessagePackCode.Int8 => GetInt8(),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;
        }

        public TOuter Value(out byte value)
        {
            try
            {
                value = MessagePackBinary.ReadByte(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out byte? value)
        {
            var code = ReadU1();
            value = code switch
            {
                MessagePackCode.Nil => null,
                >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt => (byte)code,
                MessagePackCode.UInt8 => GetUInt8(),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;
        }

        public TOuter Value(out short value)
        {
            try
            {
                value = MessagePackBinary.ReadInt16(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out short? value)
        {
            var code = ReadU1();
            value = code switch
            {
                MessagePackCode.Nil => null,
                >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt => (short)code,
                >= MessagePackCode.MinNegativeFixInt and <= MessagePackCode.MaxNegativeFixInt => GetNegativeFixInt(code),
                MessagePackCode.Int8 => GetInt8(),
                MessagePackCode.UInt8 => GetUInt8(),
                MessagePackCode.Int16 => GetInt16(),
                MessagePackCode.UInt16 => CheckedConvert(GetUInt16()),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;

            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            static short CheckedConvert(ushort value)
            {
                checked
                {
                    return (short)value;
                }
            }
        }

        public TOuter Value(out ushort value)
        {
            try
            {
                value = MessagePackBinary.ReadUInt16(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out ushort? value)
        {
            var code = ReadU1();
            value = code switch
            {
                MessagePackCode.Nil => null,
                >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt => (ushort)code,
                MessagePackCode.UInt8 => GetUInt8(),
                MessagePackCode.UInt16 => GetUInt16(),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;
            throw new InvalidDataException($"Field {_fieldName} is invalid.");
        }

        public TOuter Value(out int value)
        {
            try
            {
                value = MessagePackBinary.ReadInt32(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out int? value)
        {
            var code = ReadU1();
            value = code switch
            {
                MessagePackCode.Nil => null,
                >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt => code,
                >= MessagePackCode.MinNegativeFixInt and <= MessagePackCode.MaxNegativeFixInt => GetNegativeFixInt(code),
                MessagePackCode.Int8 => GetInt8(),
                MessagePackCode.UInt8 => GetUInt8(),
                MessagePackCode.Int16 => GetInt16(),
                MessagePackCode.UInt16 => GetUInt16(),
                MessagePackCode.Int32 => GetInt32(),
                MessagePackCode.UInt32 => CheckedConvert(GetUInt32()),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;

            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            static int CheckedConvert(uint value)
            {
                checked
                {
                    return (int)value;
                }
            }
        }

        public TOuter Value(out uint value)
        {
            try
            {
                value = MessagePackBinary.ReadUInt32(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out uint? value)
        {
            var code = ReadU1();
            value = code switch
            {
                MessagePackCode.Nil => null,
                >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt => (uint)code,
                MessagePackCode.UInt8 => GetUInt8(),
                MessagePackCode.UInt16 => GetUInt16(),
                MessagePackCode.UInt32 => GetUInt32(),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;
        }

        public TOuter Value(out long value)
        {
            try
            {
                value = MessagePackBinary.ReadInt64(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out long? value)
        {
            var code = ReadU1();
            value = code switch
            {
                MessagePackCode.Nil => null,
                >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt => code,
                >= MessagePackCode.MinNegativeFixInt and <= MessagePackCode.MaxNegativeFixInt => GetNegativeFixInt(code),
                MessagePackCode.Int8 => GetInt8(),
                MessagePackCode.UInt8 => GetUInt8(),
                MessagePackCode.Int16 => GetInt16(),
                MessagePackCode.UInt16 => GetUInt16(),
                MessagePackCode.Int32 => GetInt32(),
                MessagePackCode.UInt32 => GetUInt32(),
                MessagePackCode.Int64 => GetInt64(),
                MessagePackCode.UInt64 => CheckedConvert(GetUInt64()),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;

            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            static long CheckedConvert(ulong value)
            {
                checked
                {
                    return (long)value;
                }
            }
        }

        public TOuter Value(out ulong value)
        {
            try
            {
                value = MessagePackBinary.ReadUInt64(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out ulong? value)
        {
            var code = ReadU1();
            value = code switch
            {
                MessagePackCode.Nil => null,
                >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt => (ulong)code,
                MessagePackCode.UInt8 => GetUInt8(),
                MessagePackCode.UInt16 => GetUInt16(),
                MessagePackCode.UInt32 => GetUInt32(),
                MessagePackCode.UInt64 => GetUInt64(),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;
        }

        public TOuter Value(out float value)
        {
            try
            {
                value = MessagePackBinary.ReadSingle(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out float? value)
        {
            value = ReadU1() switch
            {
                MessagePackCode.Nil => null,
                MessagePackCode.Float32 => GetFloat32(),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;
        }

        public TOuter Value(out double value)
        {
            try
            {
                value = MessagePackBinary.ReadDouble(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out double? value)
        {
            value = ReadU1() switch
            {
                MessagePackCode.Nil => null,
                MessagePackCode.Float64 => GetFloat64(),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;
        }

        public TOuter Value(out bool value)
        {
            try
            {
                value = MessagePackBinary.ReadBoolean(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out bool? value)
        {
            value = ReadU1() switch
            {
                MessagePackCode.Nil => null,
                MessagePackCode.True => true,
                MessagePackCode.False => false,
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;
        }

        public TOuter Value(out DateTime value)
        {
            try
            {
                value = MessagePackBinary.ReadDateTime(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out DateTime? value)
        {
            value = ReadU1() switch
            {
                MessagePackCode.Nil => null,
                MessagePackCode.FixExt4 => GetDateTimeForFixExt4(),
                MessagePackCode.FixExt8 => GetDateTimeForFixExt8(),
                MessagePackCode.Ext8 => GetDateTimeForExt8(),
                _ => throw new InvalidDataException($"Field {_fieldName} is invalid."),
            };
            return _outer;
        }

        public TOuter Value(out byte[] value)
        {
            try
            {
                value = MessagePackBinary.ReadBytes(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Nil()
        {
            try
            {
                MessagePackBinary.ReadNil(_stream);
                return _outer;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid.", ex);
            }
        }

        public TOuter Value(out object value)
        {
            var code = _stream.ReadByte();
            if (code == -1)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid (EOS).");
            }
            // see: https://github.com/msgpack/msgpack/blob/master/spec.md
            switch (code)
            {
                case -1:
                    throw new InvalidDataException($"Field {_fieldName} is invalid (EOS).");
                case MessagePackCode.Nil:
                    value = null;
                    break;
                case MessagePackCode.True:
                    value = BoxedTrue;
                    break;
                case MessagePackCode.False:
                    value = BoxedFalse;
                    break;
                case MessagePackCode.Float32:
                    value = GetFloat32();
                    break;
                case MessagePackCode.Float64:
                    value = GetFloat64();
                    break;
                case >= MessagePackCode.MinFixStr and <= MessagePackCode.MaxFixStr:
                    value = ReadString(code - MessagePackCode.MinFixStr);
                    break;
                case MessagePackCode.Str8:
                    value = ReadString(ReadU1());
                    break;
                case MessagePackCode.Str16:
                    value = ReadString(ReadU2());
                    break;
                case MessagePackCode.Str32:
                    {
                        var count = (int)ReadU4();
                        if (count < 0)
                        {
                            throw new InvalidDataException($"Field {_fieldName} is invalid (string length).");
                        }
                        value = ReadString(count);
                        break;
                    }
                case MessagePackCode.Bin8:
                    value = ReadBinary(ReadU1());
                    break;
                case MessagePackCode.Bin16:
                    value = ReadBinary(ReadU2());
                    break;
                case MessagePackCode.Bin32:
                    {
                        var count = (int)ReadU4();
                        if (count < 0)
                        {
                            throw new InvalidDataException($"Field {_fieldName} is invalid (string length).");
                        }
                        value = ReadBinary(count);
                        break;
                    }
                case >= MessagePackCode.MinFixInt and <= MessagePackCode.MaxFixInt:
                    value = code;
                    break;
                case >= MessagePackCode.MinNegativeFixInt and <= MessagePackCode.MaxNegativeFixInt:
                    value = (int)GetNegativeFixInt(code);
                    break;
                case MessagePackCode.Int8:
                    value = (int)GetInt8();
                    break;
                case MessagePackCode.UInt8:
                    value = (int)GetUInt8();
                    break;
                case MessagePackCode.Int16:
                    value = (int)GetInt16();
                    break;
                case MessagePackCode.UInt16:
                    value = (int)GetUInt16();
                    break;
                case MessagePackCode.Int32:
                    value = GetInt32();
                    break;
                case MessagePackCode.UInt32:
                    var u = GetUInt32();
                    if (u > int.MaxValue)
                    {
                        value = u;
                    }
                    else
                    {
                        value = (int)u;
                    }
                    break;
                case MessagePackCode.Int64:
                    value = GetInt64();
                    break;
                case MessagePackCode.UInt64:
                    var ul = GetUInt64();
                    if (ul > long.MaxValue)
                    {
                        value = ul;
                    }
                    else
                    {
                        value = (long)ul;
                    }
                    break;
                case MessagePackCode.FixExt4:
                    value = GetDateTimeForFixExt4();
                    break;
                case MessagePackCode.FixExt8:
                    value = GetDateTimeForFixExt8();
                    break;
                case MessagePackCode.Ext8:
                    value = GetDateTimeForExt8();
                    break;
                case >= MessagePackCode.MinFixArray and <= MessagePackCode.MaxFixArray:
                    value = ReadObjectArray(code - MessagePackCode.MinFixArray);
                    break;
                case MessagePackCode.Array16:
                    value = ReadObjectArray(ReadU2());
                    break;
                case MessagePackCode.Array32:
                    {
                        var count = (int)ReadU4();
                        if (count < 0)
                        {
                            throw new InvalidDataException($"Field {_fieldName} is invalid (array count).");
                        }
                        value = ReadObjectArray(count);
                        break;
                    }
                case >= MessagePackCode.MinFixMap and <= MessagePackCode.MaxFixMap:
                    value = ReadObjectMap(code - MessagePackCode.MinFixMap);
                    break;
                case MessagePackCode.Map16:
                    value = ReadObjectMap(ReadU2());
                    break;
                case MessagePackCode.Map32:
                    {
                        var count = (int)ReadU4();
                        if (count < 0)
                        {
                            throw new InvalidDataException($"Field {_fieldName} is invalid (map count).");
                        }
                        value = ReadObjectMap(count);
                        break;
                    }
                default:
                    throw new InvalidDataException($"Field {_fieldName} is invalid (unsupported type).");
            }
            return _outer;
        }

        private int ReadU1()
        {
            var value = _stream.ReadByte();
            if (value == -1)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid (EOS).");
            }
            return value;
        }

        private int ReadU2() =>
            (ReadU1() << 8) + ReadU1();

        private uint ReadU4() =>
            ((uint)ReadU2() << 16) + (uint)ReadU2();

        private ulong ReadU8() =>
            ((ulong)ReadU4() << 32) + ReadU4();

        private string ReadString(int count)
        {
            using var owner = ExactSizeMemoryPool.Shared.Rent(count);
            int currentIndex = 0;
            int read;
            while (currentIndex < count &&
                (read = _stream.Read(owner.Memory.Span[currentIndex..(count - currentIndex)])) > 0)
            {
                currentIndex += read;
            }
            if (count != currentIndex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid (string incomplete).");
            }
            return Encoding.UTF8.GetString(owner.Memory.Span[0..count]);
        }

        private byte[] ReadBinary(int count)
        {
            var bytes = new byte[count];
            int currentIndex = 0;
            int read;
            while ((read = _stream.Read(bytes, currentIndex, count - currentIndex)) > 0)
            {
                currentIndex += read;
            }
            if (count != currentIndex)
            {
                throw new InvalidDataException($"Field {_fieldName} is invalid (binary incomplete).");
            }
            return bytes;
        }

        private object[] ReadObjectArray(int count)
        {
            var array = new object[count];
            for (int i = 0; i < count; i++)
            {
                Value(out array[i]);
            }
            return array;
        }

        private Dictionary<string, object> ReadObjectMap(int count)
        {
            Dictionary<string, object> map = new(count);
            for (int i = 0; i < count; i++)
            {
                Value(out string key);
                Value(out object value);
                map[key] = value;
            }
            return map;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static sbyte GetNegativeFixInt(int code) =>
        (sbyte)(code - MessagePackCode.MaxNegativeFixInt - 1);

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private sbyte GetInt8() => (sbyte)(byte)ReadU1();

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private byte GetUInt8() => (byte)ReadU1();

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private short GetInt16() => (short)(ushort)ReadU2();

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private ushort GetUInt16() => (ushort)ReadU2();

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private int GetInt32() => (int)ReadU4();

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private uint GetUInt32() => ReadU4();

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private long GetInt64() => (long)ReadU8();

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private ulong GetUInt64() => ReadU8();

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private float GetFloat32() => BitConverter.Int32BitsToSingle((int)ReadU4());

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private double GetFloat64() => BitConverter.Int64BitsToDouble((long)ReadU8());

        private DateTime GetDateTimeForFixExt4()
        {
            var type = ReadU1();
            if (type == 255)
            {
                return DateTime.SpecifyKind(DateTime.UnixEpoch.AddSeconds(ReadU4()), DateTimeKind.Utc);
            }
            throw new InvalidDataException($"Field {_fieldName} is invalid (unsupported extension).");
        }

        private DateTime GetDateTimeForFixExt8()
        {
            var type = ReadU1();
            if (type == 255)
            {
                var u8 = ReadU8();
                var seconds = u8 & 0x3FFFFFFFF;
                var dt = DateTime.SpecifyKind(DateTime.UnixEpoch.AddSeconds(seconds), DateTimeKind.Utc);
                var f = checked((long)(u8 >> 34));
                return dt.AddTicks(f / 100);
            }
            throw new InvalidDataException($"Field {_fieldName} is invalid (unsupported extension).");
        }

        private DateTime GetDateTimeForExt8()
        {
            var length = ReadU1();
            if (length == 12)
            {
                var type = ReadU1();
                if (type == 255)
                {
                    var u4 = ReadU4();
                    var u8 = ReadU8();
                    var dt = DateTime.SpecifyKind(DateTime.UnixEpoch.AddSeconds((long)u8), DateTimeKind.Utc);
                    return dt.AddTicks(u4 / 100);
                }
            }
            throw new InvalidDataException($"Field {_fieldName} is invalid (unsupported extension).");
        }
    }

    public struct MessagePackArrayReader<TOuter>
    {
        public readonly int Count;

        private readonly Stream _stream;
        private readonly TOuter _outer;
        private readonly string _fieldName;

        private int _index;

        internal MessagePackArrayReader(Stream stream, TOuter outer, int count, string fieldName)
        {
            _stream = stream;
            _outer = outer;
            Count = count;
            _fieldName = fieldName;
            _index = 0;
        }

        public MessagePackArrayReader<TOuter> Text(out string value) =>
            Text(string.Empty, out value);

        public MessagePackArrayReader<TOuter> Text(string fieldName, out string value)
        {
            IncreaseIndex(fieldName);
            try
            {
                value = MessagePackBinary.ReadString(_stream);
                return this;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }

        public MessagePackArrayReader<TOuter> Boolean(out bool value) =>
            Boolean(string.Empty, out value);

        public MessagePackArrayReader<TOuter> Boolean(string fieldName, out bool value)
        {
            IncreaseIndex(fieldName);
            try
            {
                value = MessagePackBinary.ReadBoolean(_stream);
                return this;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }

        public MessagePackArrayReader<TOuter> Int(out int value) =>
            Int(string.Empty, out value);

        public MessagePackArrayReader<TOuter> Int(string fieldName, out int value)
        {
            IncreaseIndex(fieldName);
            try
            {
                value = MessagePackBinary.ReadInt32(_stream);
                return this;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }

        public MessagePackArrayReader<TOuter> Bytes(out ReadOnlyMemory<byte> value) =>
            Bytes(string.Empty, out value);

        public MessagePackArrayReader<TOuter> Bytes(string fieldName, out ReadOnlyMemory<byte> value)
        {
            IncreaseIndex(fieldName);
            try
            {
                value = MessagePackBinary.ReadBytes(_stream);
                return this;
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
            }
        }


        public MessagePackValueReader<MessagePackArrayReader<TOuter>> Simple(string fieldName = "")
        {
            IncreaseIndex(fieldName);
            return new(_stream, this, FieldDisplayName(fieldName));
        }

        public MessagePackReader<MessagePackArrayReader<TOuter>> Item(string fieldName = "")
        {
            IncreaseIndex(fieldName);
            return new(_stream, this, FieldDisplayName(fieldName));
        }

        public MessagePackArrayReader<TOuter> Item<TValue>(
            Func<MessagePackReader<MessagePackTerminator<Stream>>, StrongBox<TValue>, MessagePackTerminator<Stream>> func,
            out TValue value,
            string fieldName = "")
        {
            IncreaseIndex(fieldName);
            StrongBox<TValue> box = new();
            _ = func(new(_stream, new(_stream), FieldDisplayName(fieldName)), box);
            value = box.Value;
            return this;
        }

        public MessagePackArrayReader<TOuter> OptionalText(out string value) =>
            OptionalText(string.Empty, out value);

        public MessagePackArrayReader<TOuter> OptionalText(string fieldName, out string value)
        {
            if (HasOptional())
            {
                try
                {
                    value = MessagePackBinary.ReadString(_stream);
                    return this;
                }
                catch (Exception ex)
                {
                    throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
                }
            }
            value = default;
            return this;
        }

        public MessagePackArrayReader<TOuter> OptionalInt(out int? value) =>
            OptionalInt(string.Empty, out value);

        public MessagePackArrayReader<TOuter> OptionalInt(string fieldName, out int? value)
        {
            if (HasOptional())
            {
                try
                {
                    value = MessagePackBinary.ReadInt32(_stream);
                    return this;
                }
                catch (Exception ex)
                {
                    throw new InvalidDataException($"Field {FieldDisplayName(fieldName)} is invalid.", ex);
                }
            }
            value = default;
            return this;
        }

        public MessagePackArrayReader<TOuter> Optional<TValue>(
            Func<MessagePackReader<MessagePackTerminator<Stream>>, StrongBox<TValue>, MessagePackTerminator<Stream>> func,
            out TValue value,
            string fieldName = "")
        {
            value = default;
            if (HasOptional())
            {
                StrongBox<TValue> box = new();
                func(new(_stream, new(_stream), FieldDisplayName(fieldName)), box);
                value = box.Value;
            }
            return this;
        }

        public TOuter EndArray(bool skipOptionals = true)
        {
            if (skipOptionals)
            {
                while (_index != Count)
                {
                    _index++;
                    MessagePackBinary.ReadNextBlock(_stream);
                }
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
                (true, false) => _fieldName,
                (false, true) => fieldName,
                (false, false) => _fieldName + "/" + fieldName,
            };
    }

public struct MessagePackMapReader<TOuter>
{
    private readonly Stream _stream;
    private readonly TOuter _outer;
    public readonly int Count;
    private readonly string _fieldName;

    internal MessagePackMapReader(Stream stream, TOuter outer, int count, string fieldName)
    {
        _stream = stream;
        _outer = outer;
        Count = count;
        _fieldName = fieldName;
    }

    public TOuter Text(out Dictionary<string, string> value)
    {
        value = new();
        for (int i = 0; i < Count; i++)
        {
            try
            {
                value.Add(MessagePackBinary.ReadString(_stream), MessagePackBinary.ReadString(_stream));
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName}({i}) is invalid.", ex);
            }
        }
        return _outer;
    }

    public TOuter Int(out Dictionary<string, int> value)
    {
        value = new();
        for (int i = 0; i < Count; i++)
        {
            try
            {
                value.Add(MessagePackBinary.ReadString(_stream), MessagePackBinary.ReadInt32(_stream));
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName}({i}) is invalid.", ex);
            }
        }
        return _outer;
    }

    public TOuter ToDict<TValue>(
        Func<MessagePackReader<MessagePackTerminator<Stream>>, StrongBox<TValue>, MessagePackTerminator<Stream>> func,
        out Dictionary<string, TValue> value)
    {
        value = new();
        StrongBox<TValue> box = new();
        for (int i = 0; i < Count; i++)
        {
            try
            {
                var key = MessagePackBinary.ReadString(_stream);
                _ = func(new(_stream, new(_stream), _fieldName), box);
                value.Add(key, box.Value);
            }
            catch (Exception ex)
            {
                throw new InvalidDataException($"Field {_fieldName}({i}) is invalid.", ex);
            }
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
}
#nullable restore
