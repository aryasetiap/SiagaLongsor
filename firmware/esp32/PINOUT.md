# Pinout ESP32 SiagaLongsor

Dokumen ini merangkum sambungan perangkat pada firmware ESP32 SiagaLongsor.
Target board di `platformio.ini` adalah `esp32doit-devkit-v1`.

## Ringkasan GPIO

| Fungsi | Pin ESP32 | Mode |
| --- | --- | --- |
| MPU6050 SDA | GPIO21 | I2C data |
| MPU6050 SCL | GPIO22 | I2C clock |
| Sensor kelembapan tanah AOUT | GPIO34 | ADC1 input-only |
| Tipping bucket | GPIO27 | Digital input dengan internal pull-up dan interrupt |
| LCD1602A RS | GPIO13 | Digital output |
| LCD1602A E | GPIO14 | Digital output |
| LCD1602A D4 | GPIO16 | Digital output |
| LCD1602A D5 | GPIO17 | Digital output |
| LCD1602A D6 | GPIO18 | Digital output |
| LCD1602A D7 | GPIO19 | Digital output |

Semua perangkat harus menggunakan GND yang sama dengan ESP32.

## MPU6050

| Pin MPU6050 | Sambungan ESP32 |
| --- | --- |
| VCC | 3V3 |
| GND | GND |
| SDA | GPIO21 |
| SCL | GPIO22 |
| INT | Tidak disambungkan |

Alamat I2C firmware adalah `0x68`. Gunakan suplai dan level logika 3,3 V agar
jalur SDA/SCL tidak ditarik ke 5 V.

## Capacitive Soil Moisture Sensor V2.0

| Pin sensor tanah | Sambungan ESP32 |
| --- | --- |
| VCC | 3V3 |
| GND | GND |
| AOUT | GPIO34 |

GPIO34 adalah ADC1 input-only. Tegangan AOUT tidak boleh melebihi 3,3 V.
Nilai `SOIL_ADC_DRY` dan `SOIL_ADC_WET` harus diisi dari kalibrasi sensor yang
sebenarnya; nilai yang belum dikalibrasi tidak diperlakukan sebagai nol.

## Tipping bucket curah hujan

Untuk tipping bucket dengan sakelar reed/dry contact:

| Kabel tipping bucket | Sambungan ESP32 |
| --- | --- |
| Kabel pertama | GPIO27 |
| Kabel kedua | GND |

Firmware mengaktifkan internal pull-up pada GPIO27 dan menghitung transisi
turun (`FALLING`). Jangan memasukkan tegangan 5 V ke GPIO27. Jika perangkat
bukan dry contact, pastikan keluarannya open-drain atau gunakan rangkaian
penyesuai level 3,3 V sebelum disambungkan.

## LCD1602A paralel 16-pin

LCD digunakan dalam mode 4-bit. Ikuti label pada PCB LCD, bukan hanya urutan
kiri-ke-kanan karena orientasi header dapat terlihat terbalik dari sisi depan.

| Pin LCD1602A | Sambungan | Keterangan |
| --- | --- | --- |
| VSS | GND | Ground LCD |
| VDD | Sesuai datasheet LCD, umumnya 5 V | Catu controller LCD |
| V0 | Kaki tengah potensiometer 10 kOhm | Pengatur kontras |
| RS | GPIO13 | Register select |
| RW | GND | Firmware hanya menulis ke LCD |
| E | GPIO14 | Enable |
| D0 | Tidak disambungkan | Tidak digunakan pada mode 4-bit |
| D1 | Tidak disambungkan | Tidak digunakan pada mode 4-bit |
| D2 | Tidak disambungkan | Tidak digunakan pada mode 4-bit |
| D3 | Tidak disambungkan | Tidak digunakan pada mode 4-bit |
| D4 | GPIO16 | Data bit 4 |
| D5 | GPIO17 | Data bit 5 |
| D6 | GPIO18 | Data bit 6 |
| D7 | GPIO19 | Data bit 7 |
| A | Positif backlight melalui pembatas arus | Jangan menggunakan GPIO sebagai sumber daya |
| K | GND | Katoda backlight |

Sambungan potensiometer kontras:

```text
VDD -------- kaki luar potensiometer
V0  -------- kaki tengah potensiometer
GND -------- kaki luar potensiometer lainnya
```

Untuk pengujian awal backlight, pin A dapat disambungkan ke suplai melalui
resistor seri 220 Ohm dan pin K ke GND. Periksa dahulu apakah modul sudah
memiliki resistor backlight bawaan.

ESP32 tidak toleran terhadap masukan 5 V. Karena RW diikat ke GND, LCD tidak
boleh menggerakkan D4-D7 menuju ESP32. Jika LCD diberi VDD 5 V tetapi
datasheet-nya tidak menjamin sinyal 3,3 V terbaca sebagai HIGH, gunakan buffer
logika satu arah 3,3 V ke 5 V pada RS, E, dan D4-D7.

## Pemeriksaan sebelum menyalakan

1. Pastikan tidak ada sambungan 5 V ke GPIO ESP32.
2. Pastikan semua GND tersambung bersama.
3. Pastikan RW LCD terhubung langsung ke GND.
4. Pastikan urutan D4, D5, D6, dan D7 tidak tertukar.
5. Pastikan GPIO34 hanya menerima maksimum 3,3 V.
6. Pastikan tipping bucket bekerja sebagai dry contact menuju GND.

## Referensi konfigurasi firmware

Definisi pin berada di `include/firmware_config.hpp`. Jangan mengubah sambungan
fisik tanpa memperbarui konstanta pin dan dokumentasi ini secara bersamaan.
