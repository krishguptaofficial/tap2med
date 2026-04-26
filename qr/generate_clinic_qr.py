import qrcode
import os

def generate_clinic_qr(clinic_id: str, base_url: str = "https://tap2med.com/scan?clinic="):
   
    data = f"{base_url}{clinic_id}"
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    
    qr.add_data(data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    
    folder = "clinic_qrs"
    if not os.path.exists(folder):
        os.makedirs(folder)
        
    file_path = os.path.join(folder, f"clinic_{clinic_id}.png")
    with open(file_path, 'wb') as f:
        img.save(f, 'PNG')
    
    print(f"Generated QR for Clinic ID {clinic_id} at {file_path}")
    return file_path




