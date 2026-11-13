/** Decode the version-one Eleeveon IndexedDB archive values before opening a write transaction. */
const byteArray=(value:string):Uint8Array=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
/** Copy decoded bytes to a guaranteed ArrayBuffer (never SharedArrayBuffer). */
const ownedBuffer=(bytes:Uint8Array):ArrayBuffer=>{
 const buffer=new ArrayBuffer(bytes.byteLength);
 new Uint8Array(buffer).set(bytes);
 return buffer;
};
const binaryConstructors:Record<string,(bytes:Uint8Array)=>unknown>={
 ArrayBuffer: b=>ownedBuffer(b),
 Uint8Array:b=>b,
 Int8Array:b=>new Int8Array(b.buffer),
 Uint8ClampedArray:b=>new Uint8ClampedArray(b.buffer),
 Uint16Array:b=>new Uint16Array(b.buffer),
 Int16Array:b=>new Int16Array(b.buffer),
 Uint32Array:b=>new Uint32Array(b.buffer),
 Int32Array:b=>new Int32Array(b.buffer),
 Float32Array:b=>new Float32Array(b.buffer),
 Float64Array:b=>new Float64Array(b.buffer),
 BigInt64Array:b=>new BigInt64Array(b.buffer),
 BigUint64Array:b=>new BigUint64Array(b.buffer),
 DataView:b=>new DataView(b.buffer),
};
export async function decodeIDB(value:unknown, depth=0):Promise<unknown>{
 if(depth>80)throw new Error('Backup value nesting exceeds safe limit');
 if(value===null || ['string','number','boolean'].includes(typeof value))return value;
 if(typeof value!=='object')throw new Error('Invalid serialized IndexedDB record');
 if(Array.isArray(value))return Promise.all(value.map(v=>decodeIDB(v,depth+1)));
 const obj=value as Record<string,unknown>;
 const tag=obj.__eleeveonType;
 if(tag!==undefined){
  switch(tag){
   case 'undefined':return undefined;
   case 'bigint':if(typeof obj.value!=='string')throw new Error('Invalid bigint');return BigInt(obj.value);
   case 'date':if(typeof obj.value!=='string' || Number.isNaN(Date.parse(obj.value)))throw new Error('Invalid Date');return new Date(obj.value);
   case 'blob':if(typeof obj.data!=='string'||typeof obj.mime!=='string')throw new Error('Invalid Blob');return new Blob([ownedBuffer(byteArray(obj.data))],{type:obj.mime});
   case 'bytes':{
    if(typeof obj.data!=='string'||typeof obj.ctor!=='string'||!Object.prototype.hasOwnProperty.call(binaryConstructors,obj.ctor))throw new Error('Unsupported binary value');
    return binaryConstructors[obj.ctor](byteArray(obj.data));
   }
   case 'map':{
    if(!Array.isArray(obj.entries))throw new Error('Invalid Map');
    const entries=await Promise.all(obj.entries.map(async pair=>{
     if(!Array.isArray(pair)||pair.length!==2)throw new Error('Invalid Map pair');
     return [await decodeIDB(pair[0],depth+1),await decodeIDB(pair[1],depth+1)] as [unknown,unknown];
    }));return new Map(entries);
   }
   case 'set':if(!Array.isArray(obj.values))throw new Error('Invalid Set');return new Set(await Promise.all(obj.values.map(v=>decodeIDB(v,depth+1))));
   default:throw new Error('Unknown backup value encoding');
  }
 }
 const out:Record<string,unknown>=Object.create(null);
 for(const [key,v] of Object.entries(obj)){
  if(key==='__proto__'||key==='prototype'||key==='constructor')throw new Error('Unsafe backup property');
  out[key]=await decodeIDB(v,depth+1);
 }
 return out;
}
