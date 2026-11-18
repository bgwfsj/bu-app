param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]$GhArgs
)

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class GhCredHelper {
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredFree(IntPtr credential);
    [StructLayout(LayoutKind.Sequential)]
    private struct CREDENTIAL {
        public int Flags;
        public int Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }
    public static byte[] ReadBlob(string target) {
        IntPtr ptr;
        if (!CredRead(target, 1, 0, out ptr)) return null;
        try {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            byte[] blob = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, blob, 0, cred.CredentialBlobSize);
            return blob;
        } finally {
            CredFree(ptr);
        }
    }
}
'@

$blob = [GhCredHelper]::ReadBlob("gh:github.com:bgwfsj")
if ($null -eq $blob) { throw "GitHub token not found" }
$env:GH_TOKEN = [System.Text.Encoding]::UTF8.GetString($blob)
& gh @GhArgs
exit $LASTEXITCODE
