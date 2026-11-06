/** Keep binary files out of JSON interaction callbacks. Webhook edits accept multipart uploads. */
export function discordMessageBody(data) {
 const {files,...payload}=data;
 if(!files?.length)return {headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
 if(files.length>10)throw new Error('Too many Discord attachments');
 const form=new FormData();
 payload.attachments=files.map((file,id)=>{
  if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(file.name)||!Buffer.isBuffer(file.data)||file.data.length>4*1024*1024)throw new Error('Invalid report attachment');
  form.append(`files[${id}]`,new Blob([file.data],{type:file.contentType??'application/octet-stream'}),file.name);
  return {id,filename:file.name};
 });
 form.append('payload_json',JSON.stringify(payload));
 return {body:form};
}
